import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  assertCandidateManifest,
  assertLoopbackOrigin,
  assertSummary,
  candidateActionNames,
  effectiveInputs,
  parseActionOutputs,
  plainSummary,
  sha256,
  sourceProvenance,
} from '../scripts/candidate-support.mjs';
import { validateReportingCandidates } from '../scripts/validate-reporting-candidates.mjs';

function manifest() {
  const source = {
    sourcePath: join(tmpdir(), 'source'),
    sourceSha: 'a'.repeat(40),
    sourceHash: 'b'.repeat(64),
  };
  return {
    schemaVersion: 1,
    classification: 'unpublished-source-candidate',
    contract: {
      ...source,
      tarball: join(tmpdir(), 'contract.tgz'),
      sha256: 'c'.repeat(64),
      integrity: 'sha512-' + 'YQ==',
    },
    sandbox: { ...source },
    actions: Object.fromEntries(
      candidateActionNames.map((name) => [
        name,
        { ...source, consumerPath: join(tmpdir(), name), bundleSha256: 'd'.repeat(64) },
      ]),
    ),
  };
}
test('candidate local origins require explicit HTTPS loopback and bounded port', () => {
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
test('invalid candidate origin fails before package checks or any network/subprocess work', async () => {
  await assert.rejects(validateReportingCandidates({}, 'https://production.example'));
});
test('candidate artifact manifest requires exact hashes and all five real consumers', () => {
  assert.equal(assertCandidateManifest(manifest()).classification, 'unpublished-source-candidate');
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
    assert.throws(() => assertCandidateManifest(value));
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
  const directory = await mkdtemp(join(tmpdir(), 'candidate-provenance-test-'));
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
  const directory = await mkdtemp(join(tmpdir(), 'candidate-preload-test-'));
  try {
    const certificate = join(directory, 'unused-ca.pem');
    await writeFile(certificate, 'unused synthetic certificate; no connection is made');
    execFileSync(
      process.execPath,
      [
        '--import',
        new URL('../scripts/candidate-fetch-preload.mjs', import.meta.url).pathname,
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
          COMMERCEKIT_CANDIDATE_MODE: 'deny',
          COMMERCEKIT_CANDIDATE_LOCAL_ORIGIN: 'https://localhost:18987',
          COMMERCEKIT_CANDIDATE_CA_FILE: certificate,
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

test('candidate child cancellation terminates a process even if it ignores SIGTERM', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'candidate-cancellation-test-'));
  try {
    const { mkdir } = await import('node:fs/promises');
    const { runCandidateBundle } = await import('../scripts/candidate-support.mjs');
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
        runCandidateBundle({
          action: { consumerPath: source },
          directory: join(directory, 'child'),
          inputs: {},
          mode: 'deny',
          localOrigin: 'https://localhost:18987',
          caFile: certificate,
          preload: new URL('../scripts/candidate-fetch-preload.mjs', import.meta.url).pathname,
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
