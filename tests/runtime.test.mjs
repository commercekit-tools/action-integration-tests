import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chmod, lstat, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createBuildEvent, createDeploymentEvent } from '@commercekit-tools/notification-contract';
import { getScenario, makePlan, scenarioIds } from '../scripts/scenarios.mjs';
import {
  assertActionRecord,
  assertLiveAuthorization,
  controlRequest,
  nextDeployInputs,
  origin,
  runCommand,
  validateRun,
} from '../scripts/runtime.mjs';

const run = {
  runId: `run_${'a'.repeat(32)}`,
  controlToken: 'synthetic-control-token',
  credentials: {
    clientId: 'synthetic-client-id',
    clientSecret: 'synthetic-client-secret',
    resource: 'urn:synthetic-resource',
    tokenUrl: `${origin}/oauth2/token`,
  },
};
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
    info: (text) => {
      logs.push(text);
    },
    summary: { addRaw: () => ({ write: async () => {} }) },
  };
}
function envFor(directory, scenario, provider = 'none') {
  return {
    STATE_DIRECTORY: directory,
    SCENARIO: scenario,
    PROVIDER: provider,
    CONFIRMATION: 'RUN-COMMERCEKIT-SANDBOX-TESTS',
    GITHUB_EVENT_NAME: 'workflow_dispatch',
    GITHUB_REPOSITORY: 'commercekit-tools/action-integration-tests',
    GITHUB_REF: 'refs/heads/main',
    GITHUB_RUN_ID: '123',
    GITHUB_RUN_ATTEMPT: '1',
    ...(provider !== 'none'
      ? {
          PROVIDER_CONFIRMATION: 'SEND-COMMERCEKIT-TEST-NOTIFICATION',
          NOTIFICATION_WEBHOOK: 'synthetic-notification-target',
        }
      : {}),
  };
}
function actionOutputs(id, phase) {
  const scenario = getScenario(id);
  const build = phase === 'build';
  const config = build ? undefined : scenario[phase];
  const outcome = build ? scenario.buildExpected : config.expected;
  const result = {
    schemaVersion: 1,
    outcome,
    durationMs: 1000,
    pollCount: id === 'build-create-error' && build ? 0 : 3,
    ...(build && id === 'build-create-error' ? {} : { buildCode: '20261114.1' }),
  };
  if (build) {
    if (id !== 'build-create-error')
      result.buildStatus =
        outcome === 'success' ? 'SUCCESS' : outcome === 'failure' ? 'FAIL' : 'BUILDING';
    result.timedOut = id === 'build-timeout';
    result.retryCount = id === 'build-rate-limit' ? 1 : 0;
    if (id === 'build-timeout')
      result.error = { code: 'BUILD_WAIT_TIMEOUT', message: 'Synthetic wait timeout.' };
    if (id === 'build-create-error')
      result.error = { code: 'CREATE_BUILD_AMBIGUOUS', message: 'Synthetic create error.' };
  } else {
    result.operation = config.operation;
    result.actionRequired = outcome === 'action-required';
    result.timedOut = phase === 'initial' && ['deploy-timeout', 'cancel'].includes(id);
    if (id !== 'deploy-create-error') {
      result.deploymentCode = '700001';
      result.originalDeploymentCode = '700001';
      result.deploymentStatus =
        outcome === 'success'
          ? 'DEPLOYED'
          : outcome === 'failure'
            ? 'FAIL'
            : outcome === 'cancelled'
              ? 'UNDEPLOYED'
              : 'DEPLOYING';
    }
    if (config.decision && config.decision !== 'MANUAL') result.decision = config.decision;
    if (config.decision === 'PREPARE_CANARY') {
      result.newDeploymentCode = '700001';
      result.trafficSplit = { updated: true };
    }
    if (config.operation === 'cancel')
      result.cancellation = { requested: true, rollbackDatabase: false };
    if (result.timedOut)
      result.error = { code: 'DEPLOYMENT_WAIT_TIMEOUT', message: 'Synthetic wait timeout.' };
    if (id === 'deploy-create-error')
      result.error = { code: 'CREATE_DEPLOYMENT_AMBIGUOUS', message: 'Synthetic create error.' };
  }
  const event = build
    ? createBuildEvent({ status: outcome, data: result })
    : createDeploymentEvent({
        status: outcome,
        data: { ...result, ...(result.decision ? { decisionType: result.decision } : {}) },
      });
  const outputs = {
    'result-json': JSON.stringify(result),
    'notification-event': JSON.stringify(event),
    'duration-ms': String(result.durationMs),
    'poll-count': String(result.pollCount),
    'build-code': result.buildCode ?? '',
    ...(build
      ? { 'build-status': result.buildStatus ?? '' }
      : {
          operation: result.operation,
          'deployment-code': result.deploymentCode ?? '',
          'deployment-status': result.deploymentStatus ?? '',
          'action-required': String(result.actionRequired),
        }),
  };
  return {
    result,
    event,
    outputs,
    outcome: ['success', 'action-required'].includes(outcome) ? 'success' : 'failure',
  };
}
function fakeControl(id, calls, extra = {}) {
  const scenario = getScenario(id);
  return async (url, init) => {
    calls.push({ url, init });
    assert.equal(new URL(url).origin, origin);
    assert.equal(init.redirect, 'error');
    if (init.method === 'POST') return Response.json(extra.run ?? run, { status: 201 });
    if (init.method === 'PUT')
      return extra.configurationFailure
        ? Response.json({ message: 'synthetic' }, { status: 500 })
        : Response.json(JSON.parse(init.body));
    if (init.method === 'DELETE') return new Response(null, { status: 204 });
    if (url.endsWith('/state'))
      return Response.json({
        counts: {
          builds: id === 'build-create-error' ? 0 : 1,
          deployments: scenario.deploy && id !== 'deploy-create-error' ? 1 : 0,
        },
        faultCounters: { 'createBuild:': 1, 'createDeployment:d1': 1 },
      });
    return Response.json({ error: 'deleted' }, { status: 404 });
  };
}

for (const id of scenarioIds) {
  test(`isolated ${id} executes expected phases, validates events and cleans run`, async () => {
    const base = await mkdtemp(join(tmpdir(), 'integration-runtime-'));
    const directory = join(base, 'state');
    const env = envFor(directory, id, id === 'rolling-success' ? 'slack' : 'none');
    const core = coreHarness();
    const calls = [];
    const fetcher = fakeControl(id, calls);
    const scenario = getScenario(id);
    const required = [
      'build',
      ...(scenario.deploy
        ? [
            'initial',
            ...(scenario.followup ? ['followup'] : []),
            ...(scenario.final ? ['final'] : []),
          ]
        : []),
    ];
    const final = actionOutputs(id, required.at(-1));
    const client = {
      request: async (path, options) => {
        assert.equal(options.policy, 'safe-read');
        return {
          status: 200,
          body: {
            kind: 'json',
            value: path.endsWith('/trafficsplit')
              ? { services: [{ code: 'commerce', percentage: 10 }] }
              : { buildCode: '20261114.1', status: final.result.deploymentStatus },
          },
        };
      },
    };
    try {
      await runCommand('prepare', env, core, { fetcher });
      assert.equal((await lstat(directory)).mode & 0o777, 0o700);
      assert.equal((await lstat(join(directory, 'run.json'))).mode & 0o777, 0o600);
      assert.equal(core.exported.CCV2_CLIENT_SECRET, run.credentials.clientSecret);
      assert(core.masked.includes(run.controlToken));
      for (const phase of required) {
        if (phase !== 'build') {
          await runCommand('deploy-inputs', { ...env, PHASE: phase }, core, { fetcher });
          assert.equal(core.outputs.enabled, 'true');
          if (phase === 'initial') assert.equal(core.outputs['build-code'], '20261114.1');
          else assert.equal(core.outputs['deployment-code'], '700001');
        }
        const value = actionOutputs(id, phase);
        await runCommand(
          'record',
          {
            ...env,
            PHASE: phase,
            OUTPUTS_JSON: JSON.stringify(value.outputs),
            ACTION_OUTCOME: value.outcome,
          },
          core,
          { fetcher },
        );
        if (env.PROVIDER !== 'none') {
          await runCommand('notify-inputs', { ...env, PHASE: phase }, core, { fetcher });
          assert.equal(core.outputs.enabled, 'true');
          assert.deepEqual(
            JSON.parse(await readFile(core.outputs['event-file'], 'utf8')),
            value.event,
          );
          const delivery = {
            delivered: 'true',
            provider: 'slack',
            'event-type': value.event.eventType,
            status: value.event.status,
            attempts: '1',
          };
          await runCommand(
            'record-notify',
            { ...env, PHASE: phase, OUTPUTS_JSON: JSON.stringify(delivery) },
            core,
            { fetcher },
          );
        }
      }
      await runCommand('assert', env, core, { fetcher, client });
      await runCommand('cleanup', env, core, { fetcher });
      await assert.rejects(lstat(directory), { code: 'ENOENT' });
      assert.equal(calls.filter(({ init }) => init.method === 'POST').length, 1);
      assert(
        calls.some(
          ({ init }) =>
            init.method === 'DELETE' && init.headers.Authorization === `Bearer ${run.controlToken}`,
        ),
      );
      for (const secret of [run.controlToken, ...Object.values(run.credentials)])
        assert(!JSON.stringify(core.logs).includes(secret));
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });
}

test('plans bound suites, never form an accidental cartesian scenario matrix', () => {
  assert.equal(makePlan('smoke').include.length, 2);
  assert.equal(makePlan('full').include.length, 16);
  assert.equal(new Set(makePlan('full').include.map((entry) => entry.scenario)).size, 16);
  assert.equal(makePlan('providers').include.length, 8);
  assert(makePlan('full').include.every((entry) => entry.provider === 'none'));
  assert.throws(() => makePlan('all'));
  assert.throws(() => getScenario('__proto__'));
  const altered = getScenario('rolling-success');
  altered.configuration.build.outcome = 'FAIL';
  assert.equal(getScenario('rolling-success').configuration.build.outcome, 'SUCCESS');
});

test('live authorization fails before any create for unapproved context or missing provider secret', async () => {
  const base = await mkdtemp(join(tmpdir(), 'integration-guard-'));
  const valid = envFor(join(base, 'state'), 'rolling-success');
  const variants = [
    { CONFIRMATION: '' },
    { GITHUB_EVENT_NAME: 'pull_request' },
    { GITHUB_REPOSITORY: 'someone/fork' },
    { GITHUB_REF: 'refs/heads/feature' },
    { PROVIDER: 'unknown' },
    { SCENARIO: 'unknown' },
    { PROVIDER: 'slack' },
    { PROVIDER: 'teams-workflow', PROVIDER_CONFIRMATION: 'SEND-COMMERCEKIT-TEST-NOTIFICATION' },
  ];
  try {
    assert.doesNotThrow(() => assertLiveAuthorization(valid));
    for (const changed of variants) {
      let calls = 0;
      await assert.rejects(
        runCommand('prepare', { ...valid, ...changed }, coreHarness(), {
          fetcher: async () => {
            calls += 1;
            throw Error('Must not call network');
          },
        }),
      );
      assert.equal(calls, 0);
    }
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

for (const extra of [
  { configurationFailure: true },
  {
    run: { ...run, credentials: { ...run.credentials, tokenUrl: 'https://unsafe.invalid/token' } },
  },
]) {
  test(`partial prepare failure retains enough identity for always-run cleanup (${extra.configurationFailure ? 'configuration' : 'credentials'})`, async () => {
    const base = await mkdtemp(join(tmpdir(), 'integration-partial-'));
    const env = envFor(join(base, 'state'), 'rolling-success');
    const calls = [];
    const fetcher = fakeControl(env.SCENARIO, calls, extra);
    try {
      await assert.rejects(runCommand('prepare', env, coreHarness(), { fetcher }));
      assert.equal((await lstat(join(env.STATE_DIRECTORY, 'run.json'))).mode & 0o777, 0o600);
      await runCommand('cleanup', env, coreHarness(), { fetcher });
      assert(calls.some(({ init }) => init.method === 'DELETE'));
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });
}

test('fixed-origin control transport rejects path escapes, oversized bodies and failed requests without leaking body', async () => {
  let called = false;
  await assert.rejects(
    controlRequest('https://unsafe.invalid', {
      fetcher: async () => {
        called = true;
      },
    }),
  );
  assert.equal(called, false);
  await assert.rejects(
    controlRequest('/sandbox/v1/runs', {
      fetcher: async () => Response.json({ secret: 'PRIVATE_RESPONSE' }, { status: 500 }),
    }),
    (error) => !error.message.includes('PRIVATE_RESPONSE'),
  );
  await assert.rejects(
    controlRequest('/sandbox/v1/runs', {
      fetcher: async () =>
        new Response('x'.repeat(1024 * 1024 + 1), {
          headers: { 'content-type': 'application/json' },
        }),
    }),
  );
  await assert.rejects(
    controlRequest('/sandbox/v1/runs', { fetcher: async () => new Response('{}') }),
  );
});

test('invalid Action outcomes, events, disclosures and output mismatches are rejected', () => {
  const value = actionOutputs('rolling-success', 'build');
  const check = (overrides = {}) =>
    assertActionRecord({
      scenarioId: 'rolling-success',
      phase: 'build',
      run,
      ...value,
      ...overrides,
    });
  assert.doesNotThrow(() => check());
  assert.throws(() => check({ outcome: 'failure' }));
  assert.throws(() => check({ outputs: { ...value.outputs, 'poll-count': '0' } }));
  assert.throws(() => check({ outputs: { ...value.outputs, 'notification-event': '{}' } }));
  assert.throws(() =>
    check({
      outputs: {
        ...value.outputs,
        'result-json': JSON.stringify({ ...value.result, leaked: run.credentials.clientSecret }),
      },
    }),
  );
  assert.throws(() =>
    check({
      outputs: {
        ...value.outputs,
        'result-json': JSON.stringify({ ...value.result, durationMs: -1 }),
      },
    }),
  );
});

test('failed phase validation never creates a record usable by downstream mutations', async () => {
  const base = await mkdtemp(join(tmpdir(), 'integration-record-'));
  const env = envFor(join(base, 'state'), 'rolling-success');
  const fetcher = fakeControl(env.SCENARIO, []);
  const core = coreHarness();
  try {
    await runCommand('prepare', env, core, { fetcher });
    await assert.rejects(
      runCommand(
        'record',
        { ...env, PHASE: 'build', OUTPUTS_JSON: '{}', ACTION_OUTCOME: 'success' },
        core,
        { fetcher },
      ),
    );
    await assert.rejects(lstat(join(env.STATE_DIRECTORY, 'build.json')), { code: 'ENOENT' });
    await assert.rejects(
      runCommand('deploy-inputs', { ...env, PHASE: 'initial' }, core, { fetcher }),
    );
    await assert.rejects(runCommand('assert', env, core, { fetcher }));
    await runCommand('cleanup', env, core, { fetcher });
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test('negative Build scenarios disable Deploy; followup always uses current returned deployment code', () => {
  const build = actionOutputs('build-failure', 'build');
  assert.deepEqual(nextDeployInputs('build-failure', 'initial', { build }), { enabled: 'false' });
  assert.throws(() =>
    nextDeployInputs('green-accept', 'followup', { build: actionOutputs('green-accept', 'build') }),
  );
  const result = nextDeployInputs('green-prepare-canary', 'final', {
    build: actionOutputs('green-prepare-canary', 'build'),
    followup: { result: { deploymentCode: '700099', originalDeploymentCode: '700001' } },
  });
  assert.equal(result['deployment-code'], '700099');
  assert.equal(result['green-decision'], 'ACCEPT');
  assert.equal(result['build-code'], undefined);
  assert.equal(result.strategy, undefined);
});

test('private state rejects symlinks and broad permissions; missing cleanup is harmless', async () => {
  const base = await mkdtemp(join(tmpdir(), 'integration-files-'));
  const env = envFor(join(base, 'state'), 'rolling-success');
  const core = coreHarness();
  const fetcher = fakeControl(env.SCENARIO, []);
  try {
    await runCommand('cleanup', env, core, { fetcher });
    await runCommand('prepare', env, core, { fetcher });
    await chmod(join(env.STATE_DIRECTORY, 'run.json'), 0o644);
    await assert.rejects(runCommand('cleanup', env, core, { fetcher }));
    await chmod(join(env.STATE_DIRECTORY, 'run.json'), 0o600);
    const other = join(base, 'other.json');
    await writeFile(other, JSON.stringify(run), { mode: 0o600 });
    await rm(join(env.STATE_DIRECTORY, 'run.json'));
    await symlink(other, join(env.STATE_DIRECTORY, 'run.json'));
    await assert.rejects(runCommand('cleanup', env, core, { fetcher }));
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test('run identity and OAuth origins are validated', () => {
  assert.equal(validateRun(run), run);
  assert.throws(() => validateRun({ ...run, runId: '../escape' }));
  assert.throws(() => validateRun({ ...run, controlToken: '' }));
  assert.throws(() =>
    validateRun({
      ...run,
      credentials: { ...run.credentials, tokenUrl: 'https://unsafe.invalid/oauth2/token' },
    }),
  );
});

test('catalog matches independently specified acceptance outcomes and fault contracts', () => {
  const acceptance = {
    'rolling-success': ['success', 'success'],
    'build-failure': ['failure'],
    'build-timeout': ['internal-error'],
    'build-rate-limit': ['success', 'success'],
    'build-create-error': ['internal-error'],
    'rolling-failure': ['success', 'failure'],
    'deploy-timeout': ['success', 'internal-error'],
    'deploy-rate-limit': ['success', 'success'],
    'deploy-create-error': ['success', 'internal-error'],
    'green-manual': ['success', 'action-required'],
    'green-accept': ['success', 'action-required', 'success'],
    'green-prepare-canary': ['success', 'action-required', 'action-required', 'success'],
    'green-reject': ['success', 'action-required', 'cancelled'],
    cancel: ['success', 'internal-error', 'cancelled'],
    resume: ['success', 'action-required', 'action-required', 'success'],
    'green-inline-accept': ['success', 'success'],
  };
  assert.deepEqual(Object.keys(acceptance), scenarioIds);
  for (const [id, expected] of Object.entries(acceptance)) {
    const scenario = getScenario(id);
    const actual = [
      scenario.buildExpected,
      ...(scenario.deploy
        ? [
            scenario.initial.expected,
            ...(scenario.followup ? [scenario.followup.expected] : []),
            ...(scenario.final ? [scenario.final.expected] : []),
          ]
        : []),
    ];
    assert.deepEqual(actual, expected, id);
  }
  for (const [id, operationId, status] of [
    ['build-rate-limit', 'getBuildProgress', 429],
    ['build-create-error', 'createBuild', 500],
    ['deploy-rate-limit', 'getDeploymentProgress', 429],
    ['deploy-create-error', 'createDeployment', 500],
  ]) {
    const [fault] = getScenario(id).configuration.faults;
    assert.equal(fault.operationId, operationId);
    assert.equal(fault.status, status);
    assert.deepEqual(fault.onCalls, [1]);
  }
  assert.equal(getScenario('cancel').configuration.deployment.outcome, 'NEVER');
  assert.equal(getScenario('deploy-timeout').configuration.deployment.outcome, 'NEVER');
  assert.equal(getScenario('build-timeout').configuration.build.outcome, 'NEVER');
  assert.equal(getScenario('green-prepare-canary').followup.decision, 'PREPARE_CANARY');
  assert.equal(getScenario('green-prepare-canary').final.decision, 'ACCEPT');
  assert.equal(getScenario('resume').followup.operation, 'resume');
});

test('provider suites fail missing or unsuccessful delivery rather than treating producer coverage as delivery', async () => {
  const base = await mkdtemp(join(tmpdir(), 'integration-delivery-'));
  const env = envFor(join(base, 'state'), 'build-failure', 'teams-workflow');
  const fetcher = fakeControl(env.SCENARIO, []);
  const core = coreHarness();
  const value = actionOutputs(env.SCENARIO, 'build');
  try {
    await runCommand('prepare', env, core, { fetcher });
    await runCommand(
      'record',
      {
        ...env,
        PHASE: 'build',
        OUTPUTS_JSON: JSON.stringify(value.outputs),
        ACTION_OUTCOME: 'failure',
      },
      core,
      { fetcher },
    );
    await assert.rejects(runCommand('assert', env, core, { fetcher }));
    for (const override of [
      { delivered: 'false' },
      { attempts: '0' },
      { provider: 'slack' },
      { status: 'success' },
    ]) {
      const delivery = {
        delivered: 'true',
        provider: 'teams-workflow',
        'event-type': value.event.eventType,
        status: 'failure',
        attempts: '1',
        ...override,
      };
      await assert.rejects(
        runCommand(
          'record-notify',
          { ...env, PHASE: 'build', OUTPUTS_JSON: JSON.stringify(delivery) },
          core,
          { fetcher },
        ),
      );
    }
    await assert.rejects(lstat(join(env.STATE_DIRECTORY, 'build-delivery.json')), {
      code: 'ENOENT',
    });
    await runCommand('cleanup', env, core, { fetcher });
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});
