import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lstat, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import {
  createBuildCleanupEvent,
  parseNotificationEventJson,
} from '@commercekit-tools/notification-contract';
import {
  cleanupScenarioId,
  getCleanupExpectations,
  getCleanupFixture,
  getScenario,
  makePlan,
} from '../scripts/scenarios.mjs';
import {
  assertCleanupRecord,
  assertLiveAuthorization,
  controlRequest,
  origin,
  runCommand,
  subscription,
} from '../scripts/runtime.mjs';

const metadata = createRequire(import.meta.url)(
  '@commercekit-tools/notification-contract/package.json',
);

const now = Date.parse('2026-11-14T00:00:00.000Z');
const run = {
  runId: `run_${'c'.repeat(32)}`,
  controlToken: 'synthetic-cleanup-control',
  credentials: {
    clientId: 'synthetic-cleanup-client',
    clientSecret: 'synthetic-cleanup-secret',
    resource: 'urn:synthetic-cleanup-resource',
    tokenUrl: `${origin}/oauth2/token`,
  },
};
const envFor = (directory) => ({
  STATE_DIRECTORY: directory,
  SCENARIO: cleanupScenarioId,
  PROVIDER: 'none',
  CONFIRMATION: 'RUN-COMMERCEKIT-SANDBOX-TESTS',
  GITHUB_EVENT_NAME: 'workflow_dispatch',
  GITHUB_REPOSITORY: 'commercekit-tools/action-integration-tests',
  GITHUB_REF: 'refs/heads/main',
});
function coreHarness() {
  const outputs = {};
  const exported = {};
  const masked = [];
  const logs = [];
  return {
    outputs,
    exported,
    masked,
    logs,
    setOutput: (name, value) => {
      outputs[name] = value;
    },
    exportVariable: (name, value) => {
      exported[name] = value;
    },
    setSecret: (value) => {
      masked.push(value);
    },
    info: (message) => {
      logs.push(message);
    },
    summary: {
      addRaw: (message) => ({
        write: async () => {
          logs.push(message);
        },
      }),
    },
  };
}
function observedState() {
  return {
    counts: { builds: 105, deployments: 3, resources: 106, events: 2 },
    faultCounters: {
      'issueToken:': 2,
      'getBuilds:': 8,
      'getDeployments:': 2,
      'getEnvironments:': 2,
      'getDatabackups:': 6,
    },
  };
}
function producerRecord() {
  // Independent accepted-output fixture, not the retention implementation under test.
  const reasons = new Map([
    [0, 'deployed'],
    [1, 'snapshot-or-backup-reference'],
    [2, 'active-build'],
    [3, 'active-build'],
    [4, 'already-marked-for-deletion'],
    [5, 'retained-age'],
    [6, 'explicitly-excluded'],
    [7, 'active-deployment-reference'],
    [8, 'active-deployment-reference'],
    [10, 'missing-timestamp'],
  ]);
  const protectedIndexes = new Set([4, 5, 10, 95, 96, 97, 98, 99, 100, 101, 102, 103, 104]);
  const result = {
    schemaVersion: 1,
    runStartedAt: new Date(now).toISOString(),
    durationMs: 1000,
    status: 'blocked',
    dryRun: true,
    scope: { subscriptionCode: subscription, applicationCode: 'commerce' },
    policy: { retentionDays: 30, keepLatest: 10, maxDeletions: 20 },
    completeness: { inventory: true, protection: false, eligibility: false },
    counts: {
      scanned: 105,
      eligible: 0,
      planned: 0,
      deletionRequested: 0,
      skipped: 105,
      failed: 0,
      unknown: 0,
      protected: 13,
      deferred: 0,
    },
    decisions: Array.from({ length: 105 }, (_, index) => ({
      code: `cleanup-${String(index).padStart(3, '0')}`,
      applicationCode: 'commerce',
      reasons: [
        ...(reasons.has(index) ? [reasons.get(index)] : []),
        ...(index >= 95 ? ['retained-latest'] : []),
        'eligibility-unverified',
      ],
      disposition: protectedIndexes.has(index) ? 'protected' : 'blocked',
    })),
    truncation: { omittedDecisions: 0 },
  };
  const event = createBuildCleanupEvent({
    status: 'failure',
    occurredAt: result.runStartedAt,
    env: {
      GITHUB_REPOSITORY: 'commercekit-tools/action-integration-tests',
      GITHUB_REF: 'refs/heads/main',
    },
    data: {
      mode: 'dry-run',
      subscriptionCode: subscription,
      applicationCode: 'commerce',
      retentionDays: 30,
      keepLatest: 10,
      cleanupStatus: 'blocked',
      durationMs: 1000,
      scannedCount: 105,
      eligibleCount: 0,
      plannedCount: 0,
      deletionRequestedCount: 0,
      skippedCount: 105,
      failedCount: 0,
      unknownCount: 0,
      deferredCount: 0,
    },
  });
  const outputs = {
    'result-json': JSON.stringify(result),
    'notification-event': JSON.stringify(event),
    'cleanup-status': 'blocked',
    'dry-run': 'true',
    'duration-ms': '1000',
    'scanned-count': '105',
    'eligible-count': '0',
    'planned-count': '0',
    'deletion-requested-count': '0',
    'skipped-count': '105',
    'failed-count': '0',
    'unknown-count': '0',
  };
  return { result, event, outputs, outcome: 'success', run, state: observedState() };
}
function fakeControl(calls, { seedFailure = false, state = observedState() } = {}) {
  return async (url, init) => {
    calls.push({ url, init });
    assert.equal(new URL(url).origin, origin);
    assert.equal(init.redirect, 'error');
    const path = new URL(url).pathname;
    if (init.method === 'POST') return Response.json(run, { status: 201 });
    assert.equal(init.headers.Authorization, `Bearer ${run.controlToken}`);
    if (init.method === 'PUT') {
      if (path.endsWith('/cleanup-fixture')) {
        assert.equal(JSON.parse(init.body).builds.length, 105);
        if (seedFailure) return Response.json({}, { status: 500 });
      }
      return Response.json({});
    }
    if (path.endsWith('/state')) return Response.json(state);
    if (init.method === 'DELETE') return new Response(null, { status: 204 });
    return Response.json({}, { status: 404 });
  };
}

test('cleanup catalog is isolated, multipage, mixed and leaves existing suites unchanged', () => {
  const fixture = getCleanupFixture(now);
  assert.equal(getScenario(cleanupScenarioId).cleanup, true);
  assert.equal(makePlan('full').include.length, 16);
  assert(!makePlan('full').include.some(({ scenario }) => scenario === cleanupScenarioId));
  assert.equal(fixture.builds.length, 105);
  assert.equal(new Set(fixture.builds.map(({ code }) => code)).size, 105);
  assert.equal(fixture.builds[0].response.deployed, true);
  assert.equal(fixture.builds[1].response.hasSnapshot, true);
  assert.equal(fixture.builds[2].response.status, 'BUILDING');
  assert.equal(fixture.builds[3].response.status, 'UNKNOWN');
  assert.equal(fixture.builds[4].response.status, 'DELETED');
  assert.equal(fixture.builds[9].response.status, 'FAIL');
  assert(!Object.hasOwn(fixture.builds[10].response, 'buildEndTimestamp'));
  assert(!Object.hasOwn(fixture.builds[11].response, 'hasSnapshot'));
  assert.equal(Date.parse(fixture.builds[13].modifiedAt), now - 3600000);
  assert(Date.parse(fixture.builds[13].response.buildEndTimestamp) < now - 30 * 86400000);
  assert.equal(
    fixture.builds[103].response.buildStartTimestamp,
    fixture.builds[104].response.buildStartTimestamp,
  );
  assert.deepEqual(
    fixture.deployments.map(({ response }) => response.status),
    ['SCHEDULED', 'DEPLOYED', 'FAIL'],
  );
  assert.equal(getCleanupExpectations().counts.protected, 13);
  fixture.builds[0].response.status = 'unsafe alteration';
  assert.equal(getCleanupFixture(now).builds[0].response.status, 'SUCCESS');
  assert.throws(() => getCleanupFixture(NaN));
});

test('cleanup producer uses actual published shared factory/parser with accurate blocked dry-run counts', () => {
  assert.equal(metadata.version, '0.0.6');
  const record = producerRecord();
  const actual = assertCleanupRecord(record);
  assert.equal(actual.targetApiMutationCount, 0);
  assert.equal(actual.event.eventType, 'ccv2.build-cleanup.completed');
  assert.equal(actual.result.counts.scanned, 105);
  assert.equal(actual.result.counts.skipped, 105);
  assert.equal(parseNotificationEventJson(record.outputs['notification-event']).status, 'failure');
});

test('shared lifecycle seeds only isolated control plane, validates repeat output, masks secrets and cleans private state', async () => {
  const base = await mkdtemp(join(tmpdir(), 'cleanup-integration-'));
  const env = envFor(join(base, 'state'));
  const core = coreHarness();
  const calls = [];
  const fetcher = fakeControl(calls);
  try {
    await runCommand('prepare', env, core, { fetcher, now: () => now });
    assert.equal((await lstat(env.STATE_DIRECTORY)).mode & 0o777, 0o700);
    assert.equal((await lstat(join(env.STATE_DIRECTORY, 'run.json'))).mode & 0o777, 0o600);
    assert.equal(core.exported.CCV2_CLIENT_SECRET, run.credentials.clientSecret);
    for (const secret of [run.controlToken, ...Object.values(run.credentials)])
      assert(core.masked.includes(secret));
    assert(calls.some(({ url }) => url.endsWith('/cleanup-fixture')));
    for (const attempt of ['first', 'repeat']) {
      const record = producerRecord();
      await runCommand(
        'record-cleanup',
        {
          ...env,
          CLEANUP_ATTEMPT: attempt,
          OUTPUTS_JSON: JSON.stringify(record.outputs),
          ACTION_OUTCOME: record.outcome,
        },
        core,
        { fetcher },
      );
      assert.equal(
        (await lstat(join(env.STATE_DIRECTORY, `${attempt}-cleanup.json`))).mode & 0o777,
        0o600,
      );
    }
    await runCommand('assert-cleanup', env, core, { fetcher });
    assert(core.logs.some((message) => message.includes('zero target API mutations')));
    assert.equal(calls.filter(({ init }) => init.method === 'POST').length, 1);
    assert.equal(calls.filter(({ init }) => init.method === 'PUT').length, 2);
    assert(calls.every(({ url }) => new URL(url).pathname.startsWith('/sandbox/v1/runs')));
    for (const secret of [run.controlToken, ...Object.values(run.credentials)])
      assert(!core.logs.join('\n').includes(secret));
    await runCommand('cleanup', env, core, { fetcher });
    await assert.rejects(lstat(env.STATE_DIRECTORY), { code: 'ENOENT' });
    await runCommand('cleanup', env, core, { fetcher });
    assert.equal(calls.filter(({ init }) => init.method === 'DELETE').length, 1);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test('new fixture seed failure retains private cleanup identity and never exports credentials', async () => {
  const base = await mkdtemp(join(tmpdir(), 'cleanup-partial-'));
  const env = envFor(join(base, 'state'));
  const core = coreHarness();
  const calls = [];
  const fetcher = fakeControl(calls, { seedFailure: true });
  try {
    await assert.rejects(runCommand('prepare', env, core, { fetcher }));
    assert.equal((await lstat(join(env.STATE_DIRECTORY, 'run.json'))).mode & 0o777, 0o600);
    assert.deepEqual(core.exported, {});
    await runCommand('cleanup', env, core, { fetcher });
    assert(calls.some(({ init }) => init.method === 'DELETE'));
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test('cleanup live guard rejects invalid context and providers before creating fixtures', async () => {
  const base = await mkdtemp(join(tmpdir(), 'cleanup-guard-'));
  const env = envFor(join(base, 'state'));
  try {
    for (const patch of [
      { CONFIRMATION: '' },
      { GITHUB_EVENT_NAME: 'schedule' },
      { GITHUB_REPOSITORY: 'someone/fork' },
      { GITHUB_REF: 'refs/heads/feature' },
      {
        PROVIDER: 'slack',
        PROVIDER_CONFIRMATION: 'SEND-COMMERCEKIT-TEST-NOTIFICATION',
        NOTIFICATION_WEBHOOK: 'synthetic-webhook',
      },
    ]) {
      assert.throws(() => assertLiveAuthorization({ ...env, ...patch }));
      let called = false;
      await assert.rejects(
        runCommand('prepare', { ...env, ...patch }, coreHarness(), {
          fetcher: async () => {
            called = true;
            throw Error('Network prohibited');
          },
        }),
      );
      assert.equal(called, false);
    }
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test('cleanup output validation rejects apply, failure, incorrect scope, counts, reasons and truncation', () => {
  const resultChanges = [
    (result) => {
      result.dryRun = false;
    },
    (result) => {
      result.status = 'success';
    },
    (result) => {
      result.completeness.eligibility = true;
    },
    (result) => {
      result.scope.applicationCode = 'different';
    },
    (result) => {
      result.counts.deletionRequested = 1;
    },
    (result) => {
      result.durationMs = -1;
    },
    (result) => {
      result.decisions[0].reasons = ['eligibility-unverified'];
    },
    (result) => {
      result.decisions[9].reasons.push('active-deployment-reference');
    },
    (result) => {
      result.decisions[13].reasons = [];
    },
    (result) => {
      result.decisions[14].reasons.push('unverified-unexpected-reason');
    },
    (result) => {
      result.decisions[14].reasons.push('eligibility-unverified');
    },
    (result) => {
      result.decisions.pop();
    },
    (result) => {
      result.truncation.omittedDecisions = 1;
    },
    (result) => {
      result.leaked = run.credentials.clientSecret;
    },
  ];
  for (const change of resultChanges) {
    const record = producerRecord();
    change(record.result);
    record.outputs['result-json'] = JSON.stringify(record.result);
    assert.throws(() => assertCleanupRecord(record));
  }
  for (const patch of [{ outcome: 'failure' }, { outputs: {} }])
    assert.throws(() => assertCleanupRecord({ ...producerRecord(), ...patch }));
  const wrongCounter = producerRecord();
  wrongCounter.outputs['scanned-count'] = '104';
  assert.throws(() => assertCleanupRecord(wrongCounter));
});

test('cleanup notifications reject malformed, mismatched, leaking and oversized data', () => {
  for (const change of [
    (event) => {
      event.data.scannedCount = 104;
    },
    (event) => {
      event.data.mode = 'apply';
    },
    (event) => {
      event.context.ref = 'refs/heads/feature';
    },
    (event) => {
      event.data.error = { code: 'synthetic', message: run.controlToken };
    },
  ]) {
    const record = producerRecord();
    change(record.event);
    record.outputs['notification-event'] = JSON.stringify(record.event);
    assert.throws(() => assertCleanupRecord(record));
  }
  for (const value of ['', '{}', 'x'.repeat(65537)]) {
    const record = producerRecord();
    record.outputs['notification-event'] = value;
    assert.throws(() => assertCleanupRecord(record));
  }
});

test('target mutation counters are checked separately from fixture/control events and read pagination', () => {
  for (const patch of [
    { 'deleteBuild:cleanup-014': 1 },
    { 'createBuild:': 1 },
    { 'createDeployment:': 1 },
    { 'unexpectedMutation:': 1 },
    { 'getBuilds:': 3 },
    { 'getBuilds:': -1 },
    { 'getBuilds:': 4.5 },
  ]) {
    const record = producerRecord();
    Object.assign(record.state.faultCounters, patch);
    assert.throws(() => assertCleanupRecord(record));
  }
  const record = producerRecord();
  record.state.counts.events = 23; // Control-plane events are not target mutations.
  assert.doesNotThrow(() => assertCleanupRecord(record));
  record.state.counts.builds = 104;
  assert.throws(() => assertCleanupRecord(record));
});

test('missing or failed records cannot pass final assertions; duplicate first record cannot overwrite', async () => {
  const base = await mkdtemp(join(tmpdir(), 'cleanup-record-'));
  const env = envFor(join(base, 'state'));
  const core = coreHarness();
  const calls = [];
  const fetcher = fakeControl(calls);
  try {
    await runCommand('prepare', env, core, { fetcher });
    await assert.rejects(runCommand('assert-cleanup', env, core, { fetcher }));
    const record = producerRecord();
    const recordEnv = {
      ...env,
      CLEANUP_ATTEMPT: 'repeat',
      OUTPUTS_JSON: JSON.stringify(record.outputs),
      ACTION_OUTCOME: 'success',
    };
    await assert.rejects(runCommand('record-cleanup', recordEnv, core, { fetcher }));
    await assert.rejects(lstat(join(env.STATE_DIRECTORY, 'repeat-cleanup.json')), {
      code: 'ENOENT',
    });
    await assert.rejects(
      runCommand('record-cleanup', { ...recordEnv, CLEANUP_ATTEMPT: '../escape' }, core, {
        fetcher,
      }),
    );
    await assert.rejects(
      runCommand(
        'record-cleanup',
        { ...recordEnv, CLEANUP_ATTEMPT: 'first', ACTION_OUTCOME: 'failure' },
        core,
        { fetcher },
      ),
    );
    await assert.rejects(lstat(join(env.STATE_DIRECTORY, 'first-cleanup.json')), {
      code: 'ENOENT',
    });
    await runCommand('record-cleanup', { ...recordEnv, CLEANUP_ATTEMPT: 'first' }, core, {
      fetcher,
    });
    const first = await readFile(join(env.STATE_DIRECTORY, 'first-cleanup.json'), 'utf8');
    await assert.rejects(
      runCommand('record-cleanup', { ...recordEnv, CLEANUP_ATTEMPT: 'first' }, core, { fetcher }),
      { code: 'EEXIST' },
    );
    assert.equal(await readFile(join(env.STATE_DIRECTORY, 'first-cleanup.json'), 'utf8'), first);
    await assert.rejects(runCommand('prepare', env, core, { fetcher }), { code: 'EEXIST' });
    assert.equal(calls.filter(({ init }) => init.method === 'POST').length, 1);
    await runCommand('cleanup', env, core, { fetcher });
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test('cleanup control whitelist permits only the supported run-scoped fixture path', async () => {
  let calls = 0;
  await controlRequest(`/sandbox/v1/runs/${run.runId}/cleanup-fixture`, {
    method: 'PUT',
    token: run.controlToken,
    body: getCleanupFixture(now),
    fetcher: async () => {
      calls += 1;
      return Response.json({});
    },
  });
  assert.equal(calls, 1);
  for (const path of [
    '/sandbox/v1/runs/../cleanup-fixture',
    `/sandbox/v1/runs/${run.runId}/cleanup-fixture/extra`,
    '/v2/subscriptions/escape/builds',
    `https://unsafe.invalid/sandbox/v1/runs/${run.runId}/cleanup-fixture`,
  ])
    await assert.rejects(
      controlRequest(path, {
        fetcher: async () => {
          throw Error('Must not fetch');
        },
      }),
    );
});
