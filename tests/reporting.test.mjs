import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  assertReportingManifest,
  assertRegistryInstall,
  parseRegistryLock,
  assertLoopbackOrigin,
  assertSummary,
  reportingActionNames,
  effectiveInputs,
  parseActionOutputs,
  plainSummary,
  sha256,
  sourceProvenance,
} from '../scripts/reporting-support.mjs';
import { validateReporting } from '../scripts/validate-reporting.mjs';

import { createBuildEvent } from '@commercekit-tools/notification-contract';
import { assertReportedInputs, actionInputNames } from '../scripts/reporting-inputs.mjs';
import { fixtureInputs } from './reporting-fixtures.mjs';

function manifest() {
  const source = {
    sourcePath: join(tmpdir(), 'source'),
    sourceSha: 'a'.repeat(40),
    sourceHash: 'b'.repeat(64),
  };
  return {
    schemaVersion: 1,
    classification: 'registry-installed',
    contract: {
      ...source,
      version: '0.0.6',
      registryTarball:
        'https://npm.pkg.github.com/download/@commercekit-tools/notification-contract/0.0.6/' +
        'a'.repeat(40),
      tarball: join(tmpdir(), 'contract.tgz'),
      sha256: 'c'.repeat(64),
      integrity: 'sha512-' + 'YQ==',
    },
    sandbox: { ...source },
    actions: Object.fromEntries(
      reportingActionNames.map((name) => [
        name,
        { ...source, consumerPath: join(tmpdir(), name), bundleSha256: 'd'.repeat(64) },
      ]),
    ),
  };
}
test('reporting local origins require explicit HTTPS loopback and bounded port', () => {
  assert.equal(assertLoopbackOrigin('https://localhost:18987'), 'https://localhost:18987');
  assert.equal(assertLoopbackOrigin('https://127.0.0.1:18987/'), 'https://127.0.0.1:18987');
  assert.equal(assertLoopbackOrigin('https://[::1]:18987/'), 'https://[::1]:18987');
  for (const value of [
    'http://localhost:18987',
    'https://portalapi.example:18987',
    'https://localhost',
    'https://localhost:443',
    'https://localhost:18987/path',
    'https://local:secret@localhost:18987',
    'https://localhost:18987?token=secret',
    'https://localhost:18987#x',
  ])
    assert.throws(() => assertLoopbackOrigin(value));
});
test('invalid reporting origin fails before package checks or any network/subprocess work', async () => {
  await assert.rejects(validateReporting({}, 'https://production.example'));
});
test('reporting artifact manifest requires exact hashes and all five real consumers', () => {
  assert.equal(assertReportingManifest(manifest()).classification, 'registry-installed');
  for (const mutate of [
    (value) => {
      value.classification = 'registry-release';
    },
    (value) => {
      delete value.actions.notify;
    },
    (value) => {
      value.actions.notify.sourceSha = 'main';
    },
    (value) => {
      value.actions.notify.sourceHash = 'unknown';
    },
    (value) => {
      value.actions.notify.bundleSha256 = 'latest';
    },
    (value) => {
      value.actions.notify.sourcePath = './source';
    },
    (value) => {
      value.contract.tarball = 'https://registry.example/package.tgz';
    },
    (value) => {
      value.contract.sha256 = '';
    },
    (value) => {
      value.contract.integrity = 'unverified';
    },
  ]) {
    const value = manifest();
    mutate(value);
    assert.throws(() => assertReportingManifest(value));
  }
});
test('actual GitHub output parsing retains multiline event JSON and rejects ambiguous records', () => {
  assert.deepEqual(
    parseActionOutputs('count=0\nevent<<delimiter\n{"status":"warning"}\ndelimiter\n'),
    { count: '0', event: '{"status":"warning"}' },
  );
  for (const value of [
    'event<<end\nunterminated',
    'invalid output',
    'count=0\ncount=1\n',
    'x'.repeat(1024 * 1024 + 1),
  ])
    assert.throws(() => parseActionOutputs(value));
});
test('metadata defaults are passed explicitly and unknown input names are rejected', () => {
  const definition = {
    inputs: { optional: {}, policy: { default: 'true' }, scope: { required: true } },
  };
  assert.deepEqual(effectiveInputs(definition, { scope: 'synthetic' }), {
    optional: '',
    policy: 'true',
    scope: 'synthetic',
  });
  assert.throws(() => effectiveInputs(definition, { invented: 'bad' }));
});
test('summary assertions check status/table/input coverage and reject confidential text', () => {
  const style = { icon: '⚠️', label: 'Completed with warnings' };
  const text =
    '## ⚠️ Example — Completed with warnings\n### Result\n| Detail | Value |\n### Inputs\n| Input | Value |\n| client-secret | [REDACTED] |\n';
  assertSummary(text, 'warning', style, ['client-secret'], ['synthetic-secret']);
  for (const value of [
    text.replace('⚠️', '✅'),
    text.replace('### Result', ''),
    text.replace('client-secret', 'unknown'),
    text + 'synthetic-secret',
  ])
    assert.throws(() =>
      assertSummary(value, 'warning', style, ['client-secret'], ['synthetic-secret']),
    );
  assert.equal(plainSummary('\\[REDACTED\\] &lt;tag&gt; &amp; safe'), '[REDACTED] <tag> & safe');
});
test('source evidence records committed identity, runtime digest and dirty fingerprint', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'reporting-provenance-test-'));
  try {
    execFileSync('git', ['init', '--quiet'], { cwd: directory });
    await writeFile(join(directory, 'action.yml'), 'runs: {using: node24}\n');
    const initial = await sourceProvenance(directory, { allowUnborn: true });
    assert.equal(initial.sourceSha, 'unborn-private-workspace');
    assert.equal(initial.dirty, true);
    assert.match(initial.runtimeHash, /^[a-f0-9]{64}$/);
    execFileSync('git', ['add', 'action.yml'], { cwd: directory });
    execFileSync(
      'git',
      [
        '-c',
        'user.name=CommerceKit fixture',
        '-c',
        'user.email=fixture@example.test',
        'commit',
        '--quiet',
        '-m',
        'synthetic fixture',
      ],
      { cwd: directory },
    );
    const committed = await sourceProvenance(directory);
    assert.equal(committed.dirty, false);
    assert.match(committed.sourceSha, /^[a-f0-9]{40}$/);
    assert.equal(committed.runtimeHash, initial.runtimeHash);
    await writeFile(join(directory, 'action.yml'), 'runs: {using: node24}\n# changed\n');
    const changed = await sourceProvenance(directory);
    assert.equal(changed.sourceSha, committed.sourceSha);
    assert.notEqual(changed.sourceHash, committed.sourceHash);
    assert.notEqual(changed.dirtyFingerprint, committed.dirtyFingerprint);
    assert.equal(sha256(await readFile(join(directory, 'action.yml'))).length, 64);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('the actual child preload blocks external fetch and native HTTPS without network', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'reporting-preload-test-'));
  try {
    const certificate = join(directory, 'unused-ca.pem');
    await writeFile(certificate, 'unused synthetic certificate; no connection is made');
    execFileSync(
      process.execPath,
      [
        '--import',
        new URL('../scripts/reporting-fetch-preload.mjs', import.meta.url).pathname,
        '--input-type=module',
        '-e',
        `
      import https from 'node:https';
      await fetch('https://production.example/private').catch(() => {});
      try { https.get('https://provider.example/private'); } catch {}
    `,
      ],
      {
        cwd: directory,
        stdio: 'pipe',
        timeout: 5000,
        env: {
          COMMERCEKIT_REPORTING_MODE: 'deny',
          COMMERCEKIT_REPORTING_LOCAL_ORIGIN: 'https://localhost:18987',
          COMMERCEKIT_REPORTING_CA_FILE: certificate,
        },
      },
    );
    assert.deepEqual(JSON.parse(await readFile(join(directory, 'network.json'), 'utf8')), {
      attempted: 2,
      sandbox: 0,
      mockProvider: 0,
      blocked: 2,
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('reporting child cancellation terminates a process even if it ignores SIGTERM', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'reporting-cancellation-test-'));
  try {
    const { mkdir } = await import('node:fs/promises');
    const { runReportingBundle } = await import('../scripts/reporting-support.mjs');
    const source = join(directory, 'consumer');
    await mkdir(join(source, 'dist'), { recursive: true });
    await writeFile(
      join(source, 'dist/index.js'),
      "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000); await new Promise(() => {});\n",
    );
    const certificate = join(directory, 'unused-ca.pem');
    await writeFile(certificate, 'unused synthetic certificate; no connection is made');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 100);
    const started = Date.now();
    try {
      await assert.rejects(
        runReportingBundle({
          action: { consumerPath: source },
          directory: join(directory, 'child'),
          inputs: {},
          mode: 'deny',
          localOrigin: 'https://localhost:18987',
          caFile: certificate,
          preload: new URL('../scripts/reporting-fetch-preload.mjs', import.meta.url).pathname,
          signal: controller.signal,
        }),
      );
      assert(Date.now() - started < 3000);
    } finally {
      clearTimeout(timer);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('registry installation proof rejects local links, ranges, integrity drift and foreign registry hosts', () => {
  const artifact = manifest().contract;
  const pkg = {
    private: true,
    dependencies: { '@commercekit-tools/notification-contract': '0.0.6' },
  };
  const lock = {
    importers: {
      '.': {
        dependencies: {
          '@commercekit-tools/notification-contract': { specifier: '0.0.6', version: '0.0.6' },
        },
      },
    },
    packages: {
      '@commercekit-tools/notification-contract@0.0.6': {
        resolution: { integrity: artifact.integrity, tarball: artifact.registryTarball },
      },
    },
  };
  assertRegistryInstall(pkg, lock, artifact);
  for (const dependency of ['^0.0.6', 'preview', 'file:/private/tmp/package.tgz'])
    assert.throws(() =>
      assertRegistryInstall(
        { ...pkg, dependencies: { '@commercekit-tools/notification-contract': dependency } },
        lock,
        artifact,
      ),
    );
  for (const mutate of [
    (value) => {
      value.importers['.'].dependencies['@commercekit-tools/notification-contract'].version =
        '0.0.4';
    },
    (value) => {
      value.packages['@commercekit-tools/notification-contract@0.0.6'].resolution.integrity =
        'sha512-wrong';
    },
    (value) => {
      value.packages['@commercekit-tools/notification-contract@0.0.6'].resolution.tarball =
        'https://registry.example/private.tgz';
    },
  ]) {
    const changed = structuredClone(lock);
    mutate(changed);
    assert.throws(() => assertRegistryInstall(pkg, changed, artifact));
  }
});

test('normal registry proof selects the pnpm 12 application graph and rejects ambiguous lock documents', () => {
  const application =
    "lockfileVersion: '9.0'\nimporters:\n  .:\n    dependencies:\n      '@commercekit-tools/notification-contract':\n        specifier: 0.0.6\n        version: 0.0.6\n";
  const manager =
    "lockfileVersion: '9.0'\nimporters:\n  .:\n    packageManagerDependencies:\n      pnpm:\n        version: 12.6.0\n";
  const selected = parseRegistryLock('---\n' + manager + '---\n' + application);
  assert.equal(
    selected.importers['.'].dependencies['@commercekit-tools/notification-contract'].version,
    '0.0.6',
  );
  assert.deepEqual(parseRegistryLock(application), selected);
  for (const text of [
    manager,
    '---\n' + application + '---\n' + application,
    'lockfileVersion: [invalid',
    application.replace('9.0', '8.0'),
  ])
    assert.throws(() => parseRegistryLock(text));
});

test('adopted producer inputs require complete metadata, validation parity and confidential masking', () => {
  const run = {
    credentials: {
      tokenUrl: 'https://sandbox.example.test/oauth2/token',
      clientId: 'synthetic-client',
      clientSecret: 'synthetic-secret',
      resource: 'synthetic-resource',
    },
  };
  const context = fixtureInputs('ccv2-build', run);
  const result = { ...context };
  const event = createBuildEvent({ status: 'success', data: result });
  assertReportedInputs('ccv2-build', result, event);
  assert.throws(() => actionInputNames('unknown'));
  for (const mutate of [
    (value, notification) => {
      delete value.inputs['client-secret'];
      delete notification.data.inputs['client-secret'];
    },
    (value, notification) => {
      value.inputs['client-secret'] = notification.data.inputs['client-secret'] =
        'unmasked-fixture';
    },
    (value, notification) => {
      value.inputsValidated = notification.data.inputsValidated = false;
    },
    (value, notification) => {
      value.inputsTruncated = notification.data.inputsTruncated = true;
    },
    (_value, notification) => {
      notification.data.inputs['application-code'] = 'different-app';
    },
    (_value, notification) => {
      notification.data.inputsValidated = false;
    },
    (value, notification) => {
      value.inputs.branch = notification.data.inputs.branch =
        'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJzeW50aGV0aWMifQ.c3ludGhldGljLXNpZ25hdHVyZQ';
    },
  ]) {
    const modified = structuredClone(result);
    const notification = structuredClone(event);
    mutate(modified, notification);
    assert.throws(() => assertReportedInputs('ccv2-build', modified, notification));
  }
});
