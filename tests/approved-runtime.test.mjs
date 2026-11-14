import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lstat, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createBuildEvent,
  createDeploymentEvent,
  parseNotificationEventJson,
} from '@commercekit-tools/notification-contract';
import { origin, runCommand, subscription } from '../scripts/runtime.mjs';

const sourceBuildCode = '20261114.7';
const fixtureBuildCode = 'approved-20261114-7';
const now = Date.parse('2026-11-14T12:00:00.000Z');
function syntheticRun(letter) {
  return {
    runId: `run_${letter.repeat(32)}`,
    controlToken: `synthetic-control-${letter.repeat(16)}`,
    credentials: {
      tokenUrl: `${origin}/oauth2/token`,
      clientId: `synthetic-client-${letter.repeat(16)}`,
      clientSecret: `synthetic-secret-${letter.repeat(16)}`,
      resource: `urn:synthetic-resource:${letter.repeat(16)}`,
    },
  };
}
const envFor = (directory) => ({
  STATE_DIRECTORY: directory,
  SCENARIO: 'rolling-success',
  PROVIDER: 'none',
  CONFIRMATION: 'RUN-COMMERCEKIT-SANDBOX-TESTS',
  GITHUB_EVENT_NAME: 'workflow_dispatch',
  GITHUB_REPOSITORY: 'commercekit-tools/action-integration-tests',
  GITHUB_REF: 'refs/heads/main',
  GITHUB_RUN_ID: '123',
  GITHUB_RUN_ATTEMPT: '1',
});
function coreHarness() {
  const outputs = [];
  const exported = {};
  const masked = [];
  const logs = [];
  return {
    outputs,
    exported,
    masked,
    logs,
    setOutput: (name, value) => {
      outputs.push([name, value]);
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
function buildOutputs(code = sourceBuildCode) {
  const result = {
    schemaVersion: 1,
    outcome: 'success',
    durationMs: 1000,
    pollCount: 1,
    buildCode: code,
    buildStatus: 'SUCCESS',
  };
  return {
    'result-json': JSON.stringify(result),
    'notification-event': JSON.stringify(
      createBuildEvent({ status: 'success', data: result, env: {} }),
    ),
    'build-code': code,
    'build-status': 'SUCCESS',
    'duration-ms': '1000',
    'poll-count': '1',
  };
}
function deployOutputs(code = fixtureBuildCode) {
  const result = {
    schemaVersion: 1,
    outcome: 'success',
    durationMs: 1000,
    pollCount: 1,
    operation: 'deploy',
    buildCode: code,
    deploymentCode: '700007',
    originalDeploymentCode: '700007',
    deploymentStatus: 'DEPLOYED',
    actionRequired: false,
  };
  return {
    'result-json': JSON.stringify(result),
    'notification-event': JSON.stringify(
      createDeploymentEvent({ status: 'success', data: result, env: {} }),
    ),
    'build-code': code,
    'deployment-code': '700007',
    'deployment-status': 'DEPLOYED',
    'action-required': 'false',
    operation: 'deploy',
    'duration-ms': '1000',
    'poll-count': '1',
  };
}
function controlHarness(run, { approved = false, seedFailure = false } = {}) {
  const calls = [];
  const state = {
    counts: { builds: 1, deployments: approved ? 1 : 0 },
    faultCounters: { 'createBuild:': approved ? 0 : 1, 'createDeployment:d1': approved ? 1 : 0 },
  };
  const fetcher = async (url, init) => {
    calls.push({ url, init });
    assert.equal(new URL(url).origin, origin);
    assert.equal(init.redirect, 'error');
    const path = new URL(url).pathname;
    if (init.method === 'POST') {
      assert.equal(path, '/sandbox/v1/runs');
      return Response.json(run, { status: 201 });
    }
    assert(path.startsWith(`/sandbox/v1/runs/${run.runId}`));
    assert.equal(init.headers.Authorization, `Bearer ${run.controlToken}`);
    if (init.method === 'PUT') {
      if (path.endsWith('/cleanup-fixture') && seedFailure)
        return Response.json({}, { status: 500 });
      return Response.json({});
    }
    if (path.endsWith('/state')) return Response.json(state);
    if (init.method === 'DELETE') return new Response(null, { status: 204 });
    return Response.json({}, { status: 404 });
  };
  return { calls, state, fetcher };
}
const record = (env, phase, outputs, core, dependencies) =>
  runCommand(
    'record',
    { ...env, PHASE: phase, OUTPUTS_JSON: JSON.stringify(outputs), ACTION_OUTCOME: 'success' },
    core,
    dependencies,
  );
function clientHarness(detail = { buildCode: fixtureBuildCode, status: 'DEPLOYED' }) {
  const reads = [];
  return {
    reads,
    request: async (path, options) => {
      reads.push({ path, options });
      assert.equal(path, `/v2/subscriptions/${subscription}/deployments/700007`);
      assert.equal(options.policy, 'safe-read');
      assert.equal(options.refreshOn401, true);
      assert.equal(options.timeoutMs, 30000);
      return { status: 200, body: { kind: 'json', value: detail } };
    },
  };
}
async function withApproved(action) {
  const base = await mkdtemp(join(tmpdir(), 'approved-runtime-'));
  const env = { ...envFor(join(base, 'state')), BUILT_BUILD_CODE: sourceBuildCode };
  const run = syntheticRun('b');
  const core = coreHarness();
  const control = controlHarness(run, { approved: true });
  try {
    await runCommand('prepare-approved-deploy', env, core, {
      fetcher: control.fetcher,
      now: () => now,
    });
    await action({ env, run, core, control });
  } finally {
    await runCommand('cleanup', env, core, { fetcher: control.fetcher });
    await rm(base, { recursive: true, force: true });
  }
}

test('validated Build handoff, source cleanup and independent approved Deploy preserve only public provenance', async () => {
  const base = await mkdtemp(join(tmpdir(), 'approved-handoff-'));
  const source = syntheticRun('a');
  const sourceEnv = envFor(join(base, 'source'));
  const sourceCore = coreHarness();
  const sourceControl = controlHarness(source);
  const approved = syntheticRun('b');
  const approvedEnv = { ...envFor(join(base, 'approved')), BUILT_BUILD_CODE: sourceBuildCode };
  const approvedCore = coreHarness();
  const approvedControl = controlHarness(approved, { approved: true });
  try {
    await runCommand('prepare', sourceEnv, sourceCore, { fetcher: sourceControl.fetcher });
    await record(sourceEnv, 'build', buildOutputs(), sourceCore, {
      fetcher: sourceControl.fetcher,
    });
    const before = sourceCore.outputs.length;
    await runCommand('handoff-build', sourceEnv, sourceCore, { fetcher: sourceControl.fetcher });
    assert.deepEqual(sourceCore.outputs.slice(before), [['build-code', sourceBuildCode]]);
    await runCommand('cleanup', sourceEnv, sourceCore, { fetcher: sourceControl.fetcher });
    await assert.rejects(lstat(sourceEnv.STATE_DIRECTORY), { code: 'ENOENT' });
    await runCommand('prepare-approved-deploy', approvedEnv, approvedCore, {
      fetcher: approvedControl.fetcher,
      now: () => now,
    });
    assert.notEqual(source.runId, approved.runId);
    assert.notEqual(source.credentials.clientSecret, approved.credentials.clientSecret);
    assert.equal((await lstat(approvedEnv.STATE_DIRECTORY)).mode & 0o777, 0o700);
    for (const name of ['run.json', 'approved-build.json'])
      assert.equal((await lstat(join(approvedEnv.STATE_DIRECTORY, name))).mode & 0o777, 0o600);
    const projection = JSON.parse(
      await readFile(join(approvedEnv.STATE_DIRECTORY, 'approved-build.json'), 'utf8'),
    );
    assert.deepEqual(projection, { sourceBuildCode, buildCode: fixtureBuildCode });
    await assert.rejects(lstat(join(approvedEnv.STATE_DIRECTORY, 'build.json')), {
      code: 'ENOENT',
    });
    await assert.rejects(lstat(join(approvedEnv.STATE_DIRECTORY, 'build-event.json')), {
      code: 'ENOENT',
    });
    const seed = approvedControl.calls.find(({ url }) => url.endsWith('/cleanup-fixture'));
    const fixture = JSON.parse(seed.init.body);
    assert.equal(fixture.builds.length, 1);
    assert.equal(fixture.builds[0].code, fixtureBuildCode);
    assert.equal(fixture.builds[0].response.code, fixtureBuildCode);
    assert.equal(fixture.builds[0].response.status, 'SUCCESS');
    assert.deepEqual(fixture.deployments, []);
    const outputStart = approvedCore.outputs.length;
    await runCommand('deploy-inputs', { ...approvedEnv, PHASE: 'initial' }, approvedCore, {
      fetcher: approvedControl.fetcher,
    });
    assert.equal(
      Object.fromEntries(approvedCore.outputs.slice(outputStart))['build-code'],
      fixtureBuildCode,
    );
    const outputs = deployOutputs();
    await record(approvedEnv, 'initial', outputs, approvedCore, {
      fetcher: approvedControl.fetcher,
    });
    const event = parseNotificationEventJson(
      await readFile(join(approvedEnv.STATE_DIRECTORY, 'initial-event.json'), 'utf8'),
    );
    assert.equal(event.eventType, 'ccv2.deployment.completed');
    assert.equal(event.data.buildCode, fixtureBuildCode);
    const client = clientHarness();
    await runCommand('assert-approved-deployment', approvedEnv, approvedCore, {
      fetcher: approvedControl.fetcher,
      client,
    });
    assert.equal(client.reads.length, 1);
    for (const [run, core] of [
      [source, sourceCore],
      [approved, approvedCore],
    ]) {
      for (const secret of [run.controlToken, ...Object.values(run.credentials)]) {
        assert(core.masked.includes(secret));
        assert(!JSON.stringify(core.outputs).includes(secret));
        assert(!core.logs.join('\n').includes(secret));
      }
      assert.equal(core.exported.CCV2_CLIENT_SECRET, run.credentials.clientSecret);
    }
    assert(approvedCore.logs.some((message) => message.includes('Recreated fixture')));
    await runCommand('cleanup', approvedEnv, approvedCore, { fetcher: approvedControl.fetcher });
    await assert.rejects(lstat(approvedEnv.STATE_DIRECTORY), { code: 'ENOENT' });
    assert.equal(sourceControl.calls.filter(({ init }) => init.method === 'DELETE').length, 1);
    assert.equal(approvedControl.calls.filter(({ init }) => init.method === 'DELETE').length, 1);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test('invalid approved source or unauthorized context fails before creating a run', async () => {
  const base = await mkdtemp(join(tmpdir(), 'approved-before-create-'));
  const env = { ...envFor(join(base, 'state')), BUILT_BUILD_CODE: sourceBuildCode };
  try {
    const variants = [
      ...[
        undefined,
        '',
        123,
        '20261114/7',
        'approved-20261114-7',
        '20261114.7\n',
        '1'.repeat(65),
      ].map((BUILT_BUILD_CODE) => ({ BUILT_BUILD_CODE })),
      { CONFIRMATION: '' },
      { GITHUB_EVENT_NAME: 'push' },
      { GITHUB_REF: 'refs/heads/feature' },
      { GITHUB_REPOSITORY: 'someone/fork' },
      { SCENARIO: 'build-failure' },
      {
        PROVIDER: 'slack',
        PROVIDER_CONFIRMATION: 'SEND-COMMERCEKIT-TEST-NOTIFICATION',
        NOTIFICATION_WEBHOOK: 'synthetic-webhook',
      },
    ];
    for (const change of variants) {
      let called = false;
      await assert.rejects(
        runCommand('prepare-approved-deploy', { ...env, ...change }, coreHarness(), {
          fetcher: async () => {
            called = true;
            throw Error('Must not fetch');
          },
        }),
      );
      assert.equal(called, false);
      await assert.rejects(lstat(env.STATE_DIRECTORY), { code: 'ENOENT' });
    }
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test('partial approved fixture failure preserves cleanup identity without public credentials or fabricated records', async () => {
  const base = await mkdtemp(join(tmpdir(), 'approved-partial-'));
  const env = { ...envFor(join(base, 'state')), BUILT_BUILD_CODE: sourceBuildCode };
  const core = coreHarness();
  const control = controlHarness(syntheticRun('b'), { approved: true, seedFailure: true });
  try {
    await assert.rejects(
      runCommand('prepare-approved-deploy', env, core, { fetcher: control.fetcher }),
    );
    assert.equal((await lstat(join(env.STATE_DIRECTORY, 'run.json'))).mode & 0o777, 0o600);
    for (const name of ['approved-build.json', 'build.json', 'build-event.json'])
      await assert.rejects(lstat(join(env.STATE_DIRECTORY, name)), { code: 'ENOENT' });
    assert.deepEqual(core.outputs, []);
    assert.deepEqual(core.exported, {});
    await runCommand('cleanup', env, core, { fetcher: control.fetcher });
    assert.equal(control.calls.filter(({ init }) => init.method === 'DELETE').length, 1);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test('handoff requires the validated source Build record and exact source-state counts', async () => {
  const base = await mkdtemp(join(tmpdir(), 'approved-source-state-'));
  const env = envFor(join(base, 'state'));
  const core = coreHarness();
  const control = controlHarness(syntheticRun('a'));
  try {
    await runCommand('prepare', env, core, { fetcher: control.fetcher });
    await assert.rejects(runCommand('handoff-build', env, core, { fetcher: control.fetcher }));
    await record(env, 'build', buildOutputs(), core, { fetcher: control.fetcher });
    for (const change of [
      (state) => {
        state.counts.builds = 2;
      },
      (state) => {
        state.counts.deployments = 1;
      },
      (state) => {
        state.faultCounters['createBuild:'] = 0;
      },
      (state) => {
        state.faultCounters['createDeployment:d1'] = 1;
      },
      (state) => {
        state.faultCounters['createDeployment:d2'] = 1;
      },
      (state) => {
        state.faultCounters['createBuild:'] = -1;
      },
      (state) => {
        state.faultCounters['createDeployment:d2'] = -1;
      },
      (state) => {
        state.faultCounters['createBuild:'] = '1';
      },
      (state) => {
        state.faultCounters['createBuild:other'] = Number.MAX_SAFE_INTEGER;
      },
    ]) {
      control.state.counts = { builds: 1, deployments: 0 };
      control.state.faultCounters = { 'createBuild:': 1, 'createDeployment:d1': 0 };
      change(control.state);
      const count = core.outputs.length;
      await assert.rejects(runCommand('handoff-build', env, core, { fetcher: control.fetcher }));
      assert.equal(core.outputs.length, count);
    }
    await writeFile(join(env.STATE_DIRECTORY, 'initial.json'), '{}', { mode: 0o600 });
    await assert.rejects(runCommand('handoff-build', env, core, { fetcher: control.fetcher }));
  } finally {
    await runCommand('cleanup', env, core, { fetcher: control.fetcher });
    await rm(base, { recursive: true, force: true });
  }
});

test('wrong source or mapped projection cannot produce deployment inputs', async () => {
  await withApproved(async ({ env, core, control }) => {
    for (const value of [
      { sourceBuildCode: 'wrong', buildCode: fixtureBuildCode },
      { sourceBuildCode: '20261114.8', buildCode: fixtureBuildCode },
      { sourceBuildCode, buildCode: 'approved-20261114-8' },
    ]) {
      await writeFile(join(env.STATE_DIRECTORY, 'approved-build.json'), JSON.stringify(value), {
        mode: 0o600,
      });
      const count = core.outputs.length;
      await assert.rejects(
        runCommand('deploy-inputs', { ...env, PHASE: 'initial' }, core, {
          fetcher: control.fetcher,
        }),
      );
      assert.equal(core.outputs.length, count);
    }
  });
});

test('approved runs forbid build records and stale/follow-up phases', async () => {
  await withApproved(async ({ env, core, control }) => {
    await assert.rejects(record(env, 'build', buildOutputs(), core, { fetcher: control.fetcher }));
    await assert.rejects(lstat(join(env.STATE_DIRECTORY, 'build.json')), { code: 'ENOENT' });
    await assert.rejects(lstat(join(env.STATE_DIRECTORY, 'build-event.json')), { code: 'ENOENT' });
    for (const phase of ['followup', 'final'])
      await assert.rejects(
        runCommand('deploy-inputs', { ...env, PHASE: phase }, core, { fetcher: control.fetcher }),
      );
    for (const phase of ['build', 'followup', 'final']) {
      const path = join(env.STATE_DIRECTORY, `${phase}.json`);
      await writeFile(path, '{}', { mode: 0o600 });
      await assert.rejects(
        runCommand('deploy-inputs', { ...env, PHASE: 'initial' }, core, {
          fetcher: control.fetcher,
        }),
      );
      await rm(path);
    }
  });
});

test('approved Deploy records must match the mapped fixture and real producer outcome', async () => {
  await withApproved(async ({ env, core, control }) => {
    for (const outputs of [deployOutputs(sourceBuildCode), deployOutputs('approved-20261114-99')]) {
      await assert.rejects(record(env, 'initial', outputs, core, { fetcher: control.fetcher }));
      await assert.rejects(lstat(join(env.STATE_DIRECTORY, 'initial.json')), { code: 'ENOENT' });
    }
    const outputs = deployOutputs();
    await assert.rejects(
      runCommand(
        'record',
        {
          ...env,
          PHASE: 'initial',
          OUTPUTS_JSON: JSON.stringify(outputs),
          ACTION_OUTCOME: 'failure',
        },
        core,
        { fetcher: control.fetcher },
      ),
    );
    await assert.rejects(
      runCommand('assert-approved-deployment', env, core, {
        fetcher: control.fetcher,
        client: clientHarness(),
      }),
    );
  });
});

test('approved final assertion rejects changed counts and mismatched authoritative deployment detail', async () => {
  await withApproved(async ({ env, core, control }) => {
    await record(env, 'initial', deployOutputs(), core, { fetcher: control.fetcher });
    for (const change of [
      (state) => {
        state.counts.builds = 2;
      },
      (state) => {
        state.counts.deployments = 0;
      },
      (state) => {
        state.faultCounters['createBuild:'] = 1;
      },
      (state) => {
        state.faultCounters['createDeployment:d1'] = 2;
      },
      (state) => {
        state.faultCounters['createDeployment:d2'] = 1;
      },
      (state) => {
        state.faultCounters = { 'createDeployment:d2': 1 };
      },
      (state) => {
        state.faultCounters['createDeployment:'] = 1;
      },
      (state) => {
        state.faultCounters = { 'createDeployment:': 1 };
      },
      (state) => {
        state.faultCounters['createBuild:unexpected'] = 1;
      },
      (state) => {
        state.faultCounters['createBuild:'] = -1;
      },
      (state) => {
        state.faultCounters['createDeployment:d2'] = -1;
      },
      (state) => {
        state.faultCounters['createDeployment:d2'] = '0';
      },
      (state) => {
        state.faultCounters['createDeployment:d2'] = 0.5;
      },
    ]) {
      control.state.counts = { builds: 1, deployments: 1 };
      control.state.faultCounters = { 'createBuild:': 0, 'createDeployment:d1': 1 };
      change(control.state);
      const client = clientHarness();
      await assert.rejects(
        runCommand('assert-approved-deployment', env, core, { fetcher: control.fetcher, client }),
      );
      assert.equal(client.reads.length, 0);
    }
    control.state.counts = { builds: 1, deployments: 1 };
    control.state.faultCounters = { 'createDeployment:d1': 1 };
    for (const detail of [
      { buildCode: sourceBuildCode, status: 'DEPLOYED' },
      { buildCode: fixtureBuildCode, status: 'DEPLOYING' },
    ])
      await assert.rejects(
        runCommand('assert-approved-deployment', env, core, {
          fetcher: control.fetcher,
          client: clientHarness(detail),
        }),
      );
    await runCommand('assert-approved-deployment', env, core, {
      fetcher: control.fetcher,
      client: clientHarness(),
    });
  });
});

test('approved commands fail without a handoff/projection and never invent a Build record', async () => {
  const base = await mkdtemp(join(tmpdir(), 'approved-no-handoff-'));
  const env = envFor(join(base, 'state'));
  const core = coreHarness();
  const control = controlHarness(syntheticRun('a'));
  try {
    await runCommand('prepare', env, core, { fetcher: control.fetcher });
    await assert.rejects(
      runCommand('deploy-inputs', { ...env, PHASE: 'initial' }, core, { fetcher: control.fetcher }),
    );
    await assert.rejects(
      runCommand('assert-approved-deployment', env, core, {
        fetcher: control.fetcher,
        client: clientHarness(),
      }),
    );
    await assert.rejects(lstat(join(env.STATE_DIRECTORY, 'build.json')), { code: 'ENOENT' });
    assert.equal(control.calls.filter(({ url }) => url.endsWith('/cleanup-fixture')).length, 0);
  } finally {
    await runCommand('cleanup', env, core, { fetcher: control.fetcher });
    await rm(base, { recursive: true, force: true });
  }
});
