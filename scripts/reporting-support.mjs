import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, lstat, mkdir, readFile, writeFile } from 'node:fs/promises';
import https from 'node:https';
import { isAbsolute, join, resolve } from 'node:path';
import { parse, parseAllDocuments } from 'yaml';

export const reportingActionNames = Object.freeze([
  'setup-commercekit',
  'ccv2-build',
  'ccv2-deploy',
  'ccv2-build-cleanup',
  'notify',
]);
export const sandboxOrigin = 'https://ccv2.sandbox.commercekit.tools';
const originalHttpsRequest = https.request.bind(https);
const hex = /^[a-f0-9]{64}$/;
const gitSha = /^[a-f0-9]{40}$/;
export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

export function assertLoopbackOrigin(value) {
  const url = new URL(value);
  assert.equal(url.protocol, 'https:');
  assert(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname));
  assert.equal(url.username + url.password + url.search + url.hash, '');
  assert.equal(url.pathname, '/');
  assert(/^\d+$/.test(url.port) && Number(url.port) >= 1024 && Number(url.port) <= 65535);
  return url.origin;
}

export function assertReportingManifest(manifest) {
  assert.equal(manifest?.schemaVersion, 1);
  assert.equal(manifest?.classification, 'registry-installed');
  assert.equal(manifest.contract?.version, '0.0.6');
  assertRegistryTarball(manifest.contract?.registryTarball);
  assert(hex.test(manifest.contract?.sha256 ?? ''));
  assert(/^sha512-[A-Za-z0-9+/]+=*$/.test(manifest.contract?.integrity ?? ''));
  assert.equal(Object.keys(manifest.actions ?? {}).length, reportingActionNames.length);
  for (const name of reportingActionNames) {
    const action = manifest.actions[name];
    assert(action && isAbsolute(action.sourcePath) && isAbsolute(action.consumerPath));
    assert(gitSha.test(action.sourceSha ?? '') && hex.test(action.sourceHash ?? ''));
    assert(hex.test(action.bundleSha256 ?? ''));
  }
  for (const item of [manifest.contract, manifest.sandbox]) {
    assert(item && isAbsolute(item.sourcePath));
    assert(gitSha.test(item.sourceSha ?? '') && hex.test(item.sourceHash ?? ''));
  }
  assert(isAbsolute(manifest.contract.tarball) && manifest.contract.tarball.endsWith('.tgz'));
  return manifest;
}

export function assertRegistryTarball(value) {
  const url = new URL(value);
  assert.equal(url.origin, 'https://npm.pkg.github.com');
  assert.equal(url.username + url.password + url.search + url.hash, '');
  assert(
    /^\/download\/@commercekit-tools\/notification-contract\/0\.0\.6\/[a-f0-9]{40}$/.test(
      url.pathname,
    ),
  );
  return url.href;
}

/** pnpm 12 stores package-manager and application graphs as separate YAML documents. */
export function parseRegistryLock(text) {
  const documents = parseAllDocuments(text);
  assert(documents.length >= 1 && documents.length <= 2);
  assert(documents.every((document) => document.errors.length === 0));
  const graphs = documents.map((document) => document.toJS());
  assert(graphs.every((graph) => graph?.lockfileVersion === '9.0'));
  const app = graphs.filter((graph) =>
    Object.hasOwn(
      graph.importers?.['.']?.dependencies ?? {},
      '@commercekit-tools/notification-contract',
    ),
  );
  assert.equal(app.length, 1, 'Exactly one application dependency graph is required.');
  return app[0];
}

/** A frozen normal registry dependency must match the reviewed public artifact. */
export function assertRegistryInstall(manifest, lock, artifact) {
  assert.equal(manifest.private, true);
  assert.equal(manifest.dependencies['@commercekit-tools/notification-contract'], '0.0.6');
  const direct = lock.importers?.['.']?.dependencies?.['@commercekit-tools/notification-contract'];
  assert.deepEqual(direct, { specifier: '0.0.6', version: '0.0.6' });
  const resolution = lock.packages?.['@commercekit-tools/notification-contract@0.0.6']?.resolution;
  assert.equal(resolution?.integrity, artifact.integrity);
  assert.equal(assertRegistryTarball(resolution?.tarball), artifact.registryTarball);
}

function git(cwd, args) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}
export async function sourceProvenance(directory, { allowUnborn = false } = {}) {
  assert(isAbsolute(directory));
  const files = git(directory, ['ls-files', '--cached', '--others', '--exclude-standard', '-z'])
    .split('\0')
    .filter(Boolean)
    .sort();
  assert(files.length > 0 && files.length <= 3000);
  const digest = createHash('sha256');
  const runtime = createHash('sha256');
  let total = 0;
  for (const file of new Set(files)) {
    assert(!isAbsolute(file) && !file.split('/').includes('..'));
    const path = join(directory, file);
    const stat = await lstat(path);
    assert(stat.isFile() && !stat.isSymbolicLink() && stat.size <= 4 * 1024 * 1024);
    total += stat.size;
    assert(total <= 32 * 1024 * 1024);
    const bytes = await readFile(path);
    const record = `${file}\0${sha256(bytes)}\n`;
    digest.update(record);
    if (/^(?:src\/|action\.yml$|tsconfig[^/]*\.json$)/.test(file)) runtime.update(record);
  }
  const status = git(directory, ['status', '--porcelain=v1']);
  const revision = (args) => {
    try {
      return git(directory, args);
    } catch {
      assert(allowUnborn);
      return 'unborn-private-workspace';
    }
  };
  return {
    sourceSha: revision(['rev-parse', 'HEAD']),
    gitTree: revision(['rev-parse', 'HEAD^{tree}']),
    dirty: status !== '',
    dirtyFingerprint: sha256(status),
    sourceHash: digest.digest('hex'),
    runtimeHash: runtime.digest('hex'),
  };
}

export function parseActionOutputs(text) {
  assert(Buffer.byteLength(text) <= 1024 * 1024);
  const outputs = {};
  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (!line) continue;
    const multiline = /^([a-z][a-z0-9-]*)<<(.+)$/.exec(line);
    if (multiline) {
      const body = [];
      while (++index < lines.length && lines[index] !== multiline[2]) body.push(lines[index]);
      assert(index < lines.length);
      assert(!Object.hasOwn(outputs, multiline[1]));
      outputs[multiline[1]] = body.join('\n');
    } else {
      const match = /^([a-z][a-z0-9-]*)=(.*)$/.exec(line);
      assert(match);
      assert(!Object.hasOwn(outputs, match[1]));
      outputs[match[1]] = match[2];
    }
  }
  return outputs;
}

/** An explicit test transport: public Sandbox paths map only to this local HTTPS server. */
export function localSandboxFetch(localOrigin, ca, signal) {
  const base = assertLoopbackOrigin(localOrigin);
  return async (input, init = {}) => {
    const source = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    assert.equal(
      source.origin,
      sandboxOrigin,
      'Only the fixed Sandbox origin may use local transport.',
    );
    assert(
      source.pathname.startsWith('/sandbox/v1/') ||
        source.pathname.startsWith('/v2/') ||
        source.pathname === '/oauth2/token',
    );
    assert.equal(source.username + source.password + source.hash, '');
    const target = new URL(source.pathname + source.search, base);
    const signals = [
      AbortSignal.timeout(10000),
      ...(signal ? [signal] : []),
      ...(init.signal ? [init.signal] : []),
    ];
    return await new Promise((resolveResponse, reject) => {
      const req = originalHttpsRequest(
        target,
        {
          method: init.method ?? 'GET',
          ca,
          rejectUnauthorized: true,
          headers: Object.fromEntries(new Headers(init.headers).entries()),
          signal: AbortSignal.any(signals),
        },
        (response) => {
          const chunks = [];
          let size = 0;
          response.on('data', (chunk) => {
            size += chunk.length;
            if (size > 1024 * 1024) req.destroy(new Error('Local response limit exceeded.'));
            else chunks.push(chunk);
          });
          response.on('error', reject);
          response.on('end', () => {
            const status = response.statusCode;
            const headers = new Headers();
            for (const [name, value] of Object.entries(response.headers))
              if (value !== undefined)
                headers.set(name, Array.isArray(value) ? value.join(', ') : value);
            resolveResponse(
              new Response([204, 205, 304].includes(status) ? null : Buffer.concat(chunks), {
                status,
                headers,
              }),
            );
          });
        },
      );
      req.on('error', reject);
      if (init.body !== undefined) {
        assert(typeof init.body === 'string' || Buffer.isBuffer(init.body));
        req.write(init.body);
      }
      req.end();
    });
  };
}

export function plainSummary(markdown) {
  return markdown
    .replace(/\\([\\`*_[\]{}()|!#~])/g, '$1')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&');
}
export function assertSummary(markdown, status, style, names = [], secrets = []) {
  assert(Buffer.byteLength(markdown) > 0 && Buffer.byteLength(markdown) <= 65536);
  assert(markdown.startsWith(`## ${style.icon} `));
  assert(markdown.includes(style.label));
  assert(markdown.includes('### Result') && markdown.includes('| Detail | Value |'));
  if (names.length) {
    assert(markdown.includes('### Inputs') && markdown.includes('| Input | Value |'));
    for (const name of names) assert(markdown.includes(name), 'Input name missing from summary.');
  }
  for (const secret of secrets.filter(Boolean))
    assert(!markdown.includes(secret), 'Secret leaked in summary.');
  assert(typeof status === 'string');
}

export async function actionMetadata(directory) {
  const document = parse(await readFile(join(directory, 'action.yml'), 'utf8'));
  assert.equal(document.runs.using, 'node24');
  assert.equal(document.runs.main, 'dist/index.js');
  assert(document.inputs && Object.keys(document.inputs).length <= 50);
  return document;
}
export function effectiveInputs(metadata, overrides) {
  const values = Object.fromEntries(
    Object.entries(metadata.inputs).map(([name, input]) => [name, String(input.default ?? '')]),
  );
  for (const name of Object.keys(overrides)) assert(Object.hasOwn(values, name));
  return { ...values, ...overrides };
}

export async function runReportingBundle({
  action,
  directory,
  inputs,
  mode,
  localOrigin,
  caFile,
  preload,
  signal,
  mockStatus = 200,
}) {
  await mkdir(directory, { mode: 0o700 });
  await copyFile(join(action.consumerPath, 'dist/index.js'), join(directory, 'index.mjs'));
  for (const file of ['output', 'summary'])
    await writeFile(join(directory, file), '', { mode: 0o600 });
  const env = {
    PATH: process.env.PATH,
    TZ: 'UTC',
    RUNNER_TEMP: directory,
    RUNNER_TOOL_CACHE: join(directory, 'tool-cache'),
    GITHUB_OUTPUT: join(directory, 'output'),
    GITHUB_STEP_SUMMARY: join(directory, 'summary'),
    GITHUB_REPOSITORY: 'commercekit-tools/action-integration-tests',
    GITHUB_REF: 'refs/heads/main',
    GITHUB_RUN_ID: '123',
    GITHUB_RUN_ATTEMPT: '1',
    GITHUB_SERVER_URL: 'https://github.com',
    COMMERCEKIT_REPORTING_MODE: mode,
    COMMERCEKIT_REPORTING_LOCAL_ORIGIN: localOrigin,
    COMMERCEKIT_REPORTING_CA_FILE: caFile,
    COMMERCEKIT_REPORTING_MOCK_STATUS: String(mockStatus),
    NODE_EXTRA_CA_CERTS: caFile,
  };
  for (const [name, value] of Object.entries(inputs)) env[`INPUT_${name.toUpperCase()}`] = value;
  const child = spawn(process.execPath, ['--import', preload, join(directory, 'index.mjs')], {
    cwd: directory,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    signal,
  });
  // Mask commands may contain generated credentials. Drain without retaining stdout/stderr.
  child.stdout.resume();
  child.stderr.resume();
  const timer = setTimeout(() => child.kill('SIGKILL'), 60000);
  let code;
  try {
    code = await new Promise((resolveExit, reject) => {
      child.once('error', reject);
      child.once('exit', resolveExit);
    });
  } finally {
    clearTimeout(timer);
    if (child.exitCode === null) child.kill('SIGKILL');
  }
  assert(Number.isInteger(code));
  assert((await lstat(join(directory, 'output'))).size <= 1024 * 1024);
  assert((await lstat(join(directory, 'summary'))).size <= 65536);
  const outputs = parseActionOutputs(await readFile(join(directory, 'output'), 'utf8'));
  const summary = await readFile(join(directory, 'summary'), 'utf8');
  const network = JSON.parse(await readFile(join(directory, 'network.json'), 'utf8'));
  assert.deepEqual(Object.keys(network).sort(), [
    'attempted',
    'blocked',
    'mockProvider',
    'sandbox',
  ]);
  for (const count of Object.values(network))
    assert(Number.isSafeInteger(count) && count >= 0 && count <= 10000);
  assert.equal(network.attempted, network.blocked + network.mockProvider + network.sandbox);
  let payload;
  if (mode === 'provider-mock' && network.mockProvider > 0) {
    assert((await lstat(join(directory, 'payload.json'))).size <= 65536);
    payload = JSON.parse(await readFile(join(directory, 'payload.json'), 'utf8'));
  }
  return { outputs, summary, network, code, ...(payload ? { payload } : {}) };
}

export function resolveReportingPath(value) {
  assert(typeof value === 'string' && isAbsolute(value));
  return resolve(value);
}
