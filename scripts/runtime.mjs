import assert from 'node:assert/strict';
import { chmod, lstat, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { TechnicalUserTokenManager, createCcv2Client } from '@commercekit-tools/ccv2-client';
import { parseNotificationEventJson } from '@commercekit-tools/notification-contract';
import { getScenario, phases, providers } from './scenarios.mjs';

export const origin = 'https://ccv2.sandbox.commercekit.tools';
export const subscription = '131762872233634f29fdeb7d50983aa4';
const prefix = `/v2/subscriptions/${subscription}`;
const runPattern = /^run_[a-f0-9]{32}$/;
const maxJsonBytes = 1024 * 1024;

function requireValue(condition) {
  if (!condition) throw new Error('Integration assertion failed.');
}

export function assertLiveAuthorization(env) {
  requireValue(env.CONFIRMATION === 'RUN-COMMERCEKIT-SANDBOX-TESTS');
  requireValue(env.GITHUB_EVENT_NAME === 'workflow_dispatch');
  requireValue(env.GITHUB_REPOSITORY === 'commercekit-tools/action-integration-tests');
  requireValue(env.GITHUB_REF === 'refs/heads/main');
  requireValue(providers.includes(env.PROVIDER));
  if (env.PROVIDER !== 'none') {
    requireValue(env.PROVIDER_CONFIRMATION === 'SEND-COMMERCEKIT-TEST-NOTIFICATION');
    requireValue(
      typeof env.NOTIFICATION_WEBHOOK === 'string' && env.NOTIFICATION_WEBHOOK.length > 0,
    );
  }
  getScenario(env.SCENARIO);
}

export async function controlRequest(
  path,
  { method = 'GET', token, body, expectedStatus = 200, fetcher = fetch } = {},
) {
  requireValue(
    path === '/sandbox/v1/runs' ||
      /^\/sandbox\/v1\/runs\/run_[a-f0-9]{32}(?:\/(?:scenario|state))?$/.test(path),
  );
  const response = await fetcher(`${origin}${path}`, {
    method,
    redirect: 'error',
    signal: AbortSignal.timeout(30000),
    headers: {
      Accept: 'application/json',
      'User-Agent': 'CommerceKit-Integration-Tests/1.0',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  requireValue(response.status === expectedStatus);
  if (expectedStatus === 204 || expectedStatus === 404) {
    await response.body?.cancel();
    return undefined;
  }
  requireValue((response.headers.get('content-type') ?? '').includes('json'));
  const reader = response.body?.getReader();
  requireValue(reader);
  const chunks = [];
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      requireValue(bytes <= maxJsonBytes);
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function validateControlRun(run) {
  requireValue(run && runPattern.test(run.runId));
  requireValue(typeof run.controlToken === 'string' && run.controlToken.length >= 16);
  return run;
}

export function validateRun(run) {
  validateControlRun(run);
  requireValue(run.credentials?.tokenUrl === `${origin}/oauth2/token`);
  for (const field of ['clientId', 'clientSecret', 'resource'])
    requireValue(typeof run.credentials[field] === 'string' && run.credentials[field].length >= 8);
  return run;
}

function secrets(run) {
  return [run.controlToken, ...Object.values(run.credentials)];
}

function privateDirectory(env) {
  requireValue(typeof env.STATE_DIRECTORY === 'string' && isAbsolute(env.STATE_DIRECTORY));
  return env.STATE_DIRECTORY;
}

async function readPrivate(directory, name) {
  const path = join(directory, name);
  const stat = await lstat(path);
  requireValue(stat.isFile() && !stat.isSymbolicLink() && stat.size <= maxJsonBytes);
  requireValue((stat.mode & 0o077) === 0);
  return JSON.parse(await readFile(path, 'utf8'));
}

async function writePrivate(directory, name, value) {
  const path = join(directory, name);
  await writeFile(path, JSON.stringify(value), { mode: 0o600, flag: 'wx' });
}

async function exists(directory, name) {
  try {
    await lstat(join(directory, name));
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

export function managementClient(run, { fetcher = fetch, maskSecret = () => {} } = {}) {
  const runtime = { fetch: fetcher, maskSecret };
  const tokens = new TechnicalUserTokenManager(
    {
      tokenEndpoint: run.credentials.tokenUrl,
      clientId: run.credentials.clientId,
      clientSecret: run.credentials.clientSecret,
      resource: run.credentials.resource,
    },
    { runtime },
  );
  return createCcv2Client({ baseUrl: origin, tokens, runtime });
}

async function managementRead(client, path) {
  const response = await client.request(`${prefix}${path}`, {
    policy: 'safe-read',
    refreshOn401: true,
    timeoutMs: 30000,
    maxResponseBytes: maxJsonBytes,
  });
  requireValue(response.status === 200 && response.body.kind === 'json');
  return response.body.value;
}

function phaseFrom(env) {
  requireValue(phases.includes(env.PHASE));
  return env.PHASE;
}

function expectedFor(scenario, phase) {
  if (phase === 'build') return scenario.buildExpected;
  requireValue(scenario.deploy && scenario[phase]);
  return scenario[phase].expected;
}

export function assertActionRecord({ scenarioId, phase, outputs, outcome, run }) {
  const scenario = getScenario(scenarioId);
  requireValue(phases.includes(phase));
  requireValue(
    outputs &&
      typeof outputs['result-json'] === 'string' &&
      typeof outputs['notification-event'] === 'string',
  );
  const rawResult = outputs['result-json'];
  const rawEvent = outputs['notification-event'];
  requireValue(Buffer.byteLength(rawResult) <= 16384);
  for (const secret of secrets(run))
    requireValue(!rawResult.includes(secret) && !rawEvent.includes(secret));
  const result = JSON.parse(rawResult);
  const event = parseNotificationEventJson(rawEvent, { maxBytes: 16384 });
  const expected = expectedFor(scenario, phase);
  assert.equal(result.schemaVersion, 1);
  assert.equal(result.outcome, expected);
  assert.equal(event.status, expected);
  assert.equal(outcome, ['success', 'action-required'].includes(expected) ? 'success' : 'failure');
  requireValue(Number.isSafeInteger(result.durationMs) && result.durationMs >= 0);
  requireValue(Number.isSafeInteger(result.pollCount) && result.pollCount >= 0);
  assert.equal(outputs['duration-ms'], String(result.durationMs));
  assert.equal(outputs['poll-count'], String(result.pollCount));
  assert.equal(outputs['build-code'], result.buildCode ?? '');
  const build = phase === 'build';
  assert.equal(event.source.component, build ? 'ccv2-build' : 'ccv2-deploy');
  assert.equal(
    event.eventType,
    build
      ? 'ccv2.build.completed'
      : expected === 'action-required'
        ? 'ccv2.deployment.action-required'
        : 'ccv2.deployment.completed',
  );
  assert.equal(event.data.durationMs, result.durationMs);
  assert.equal(event.data.buildCode, result.buildCode);
  if (build) {
    assert.equal(outputs['build-status'], result.buildStatus ?? '');
    assert.equal(event.data.buildStatus, result.buildStatus);
    if (scenarioId === 'build-create-error') {
      assert.equal(result.error?.code, 'CREATE_BUILD_AMBIGUOUS');
      assert.equal(result.pollCount, 0);
      requireValue(!result.buildCode);
    } else {
      requireValue(/^\d{8}\.\d+$/.test(result.buildCode));
      assert.equal(
        result.buildStatus,
        expected === 'success' ? 'SUCCESS' : expected === 'failure' ? 'FAIL' : 'BUILDING',
      );
    }
    if (scenarioId === 'build-timeout') {
      assert.equal(result.error?.code, 'BUILD_WAIT_TIMEOUT');
      assert.equal(result.timedOut, true);
    }
    if (scenarioId === 'build-rate-limit') requireValue(result.retryCount >= 1);
  } else {
    assert.equal(outputs['deployment-code'], result.deploymentCode ?? '');
    assert.equal(outputs['deployment-status'], result.deploymentStatus ?? '');
    assert.equal(outputs['action-required'], String(result.actionRequired));
    assert.equal(outputs.operation, scenario[phase].operation);
    assert.equal(result.operation, scenario[phase].operation);
    assert.equal(event.data.deploymentCode, result.deploymentCode);
    assert.equal(event.data.deploymentStatus, result.deploymentStatus);
    if (scenarioId === 'deploy-create-error') {
      assert.equal(result.error?.code, 'CREATE_DEPLOYMENT_AMBIGUOUS');
      requireValue(!result.deploymentCode);
    } else {
      requireValue(/^\d+$/.test(result.deploymentCode));
      assert.equal(
        result.deploymentStatus,
        expected === 'success'
          ? 'DEPLOYED'
          : expected === 'failure'
            ? 'FAIL'
            : expected === 'cancelled'
              ? 'UNDEPLOYED'
              : 'DEPLOYING',
      );
    }
    assert.equal(result.actionRequired, expected === 'action-required');
    if (phase === 'initial' && ['deploy-timeout', 'cancel'].includes(scenarioId)) {
      assert.equal(result.error?.code, 'DEPLOYMENT_WAIT_TIMEOUT');
      assert.equal(result.timedOut, true);
    }
    const decision = scenario[phase].decision;
    if (decision && decision !== 'MANUAL') assert.equal(result.decision, decision);
    if (decision === 'PREPARE_CANARY') {
      requireValue(result.newDeploymentCode);
      assert.equal(result.trafficSplit?.updated, true);
    }
    if (scenarioId === 'cancel' && phase === 'followup')
      assert.equal(result.cancellation?.requested, true);
    if (scenarioId === 'deploy-rate-limit') requireValue(result.pollCount >= 3);
  }
  return { result, event, outputs, outcome };
}

export function nextDeployInputs(scenarioId, phase, records) {
  const scenario = getScenario(scenarioId);
  requireValue(['initial', 'followup', 'final'].includes(phase));
  requireValue(records.build);
  if (!scenario.deploy) return { enabled: 'false' };
  requireValue(records.build.result.outcome === 'success');
  if (!scenario[phase]) return { enabled: 'false' };
  const config = scenario[phase];
  if (phase === 'initial')
    return {
      enabled: 'true',
      operation: 'deploy',
      'build-code': records.build.result.buildCode,
      'environment-code': 'd1',
      'database-update-mode': 'NONE',
      strategy: scenario.strategy,
      'green-decision': config.decision,
    };
  const previous = records[phase === 'followup' ? 'initial' : 'followup'];
  requireValue(previous?.result.deploymentCode);
  return {
    enabled: 'true',
    operation: config.operation,
    'deployment-code': previous.result.deploymentCode,
    'green-decision': config.decision ?? 'MANUAL',
    ...(config.decision === 'PREPARE_CANARY'
      ? {
          'traffic-split-json': JSON.stringify({
            services: [{ code: 'commerce', percentage: 10 }],
          }),
        }
      : {}),
  };
}

export async function runCommand(command, env, core, dependencies = {}) {
  const directory = privateDirectory(env);
  const fetcher = dependencies.fetcher ?? fetch;
  const request = (path, options) => controlRequest(path, { ...options, fetcher });
  const scenario = getScenario(env.SCENARIO);
  if (command === 'prepare') {
    assertLiveAuthorization(env);
    await mkdir(directory, { mode: 0o700 });
    await chmod(directory, 0o700);
    const run = validateControlRun(
      await request('/sandbox/v1/runs', { method: 'POST', expectedStatus: 201 }),
    );
    core.setSecret(run.controlToken);
    for (const value of Object.values(run.credentials ?? {}))
      if (typeof value === 'string') core.setSecret(value);
    // Retain cleanup identity even if credentials or subsequent configuration are invalid.
    await writePrivate(directory, 'run.json', run);
    validateRun(run);
    await request(`/sandbox/v1/runs/${run.runId}/scenario`, {
      method: 'PUT',
      token: run.controlToken,
      body: scenario.configuration,
    });
    for (const [name, value] of Object.entries({
      CCV2_TOKEN_ENDPOINT: run.credentials.tokenUrl,
      CCV2_CLIENT_ID: run.credentials.clientId,
      CCV2_CLIENT_SECRET: run.credentials.clientSecret,
      CCV2_RESOURCE: run.credentials.resource,
    }))
      core.exportVariable(name, value);
    core.setOutput(
      'build-name',
      `synthetic-${env.GITHUB_RUN_ID ?? 'run'}-${env.GITHUB_RUN_ATTEMPT ?? '1'}`,
    );
    core.info('Disposable Sandbox run prepared.');
    return;
  }
  if (command === 'cleanup' && !(await exists(directory, 'run.json'))) {
    core.info('No disposable run was created.');
    return;
  }
  const run = validateControlRun(await readPrivate(directory, 'run.json'));
  core.setSecret(run.controlToken);
  if (command === 'cleanup') {
    await request(`/sandbox/v1/runs/${run.runId}`, {
      method: 'DELETE',
      token: run.controlToken,
      expectedStatus: 204,
    });
    await request(`/sandbox/v1/runs/${run.runId}`, {
      token: run.controlToken,
      expectedStatus: 404,
    });
    await rm(directory, { recursive: true });
    core.info('Disposable Sandbox run deleted and absence verified.');
    return;
  }
  validateRun(run);
  for (const secret of secrets(run)) core.setSecret(secret);
  const records = {};
  for (const phase of phases)
    if (await exists(directory, `${phase}.json`))
      records[phase] = await readPrivate(directory, `${phase}.json`);
  if (command === 'deploy-inputs') {
    const values = nextDeployInputs(env.SCENARIO, phaseFrom(env), records);
    for (const [name, value] of Object.entries(values)) core.setOutput(name, value);
    return;
  }
  if (command === 'record') {
    const phase = phaseFrom(env);
    const record = assertActionRecord({
      scenarioId: env.SCENARIO,
      phase,
      outputs: JSON.parse(env.OUTPUTS_JSON ?? ''),
      outcome: env.ACTION_OUTCOME,
      run,
    });
    if (phase !== 'build') {
      requireValue(record.result.buildCode === records.build?.result.buildCode);
      if (phase !== 'initial')
        requireValue(
          record.result.originalDeploymentCode ===
            records[phase === 'followup' ? 'initial' : 'followup']?.result.deploymentCode,
        );
    }
    // The record is the commit marker; downstream phases cannot use partial writes.
    await writePrivate(directory, `${phase}-event.json`, record.event);
    await writePrivate(directory, `${phase}.json`, record);
    core.info(`Expected ${phase} result and event verified.`);
    return;
  }
  if (command === 'notify-inputs') {
    const phase = phaseFrom(env);
    requireValue(providers.includes(env.PROVIDER));
    const enabled = env.PROVIDER !== 'none' && Boolean(records[phase]);
    core.setOutput('enabled', String(enabled));
    if (enabled) core.setOutput('event-file', join(directory, `${phase}-event.json`));
    return;
  }
  if (command === 'record-notify') {
    const phase = phaseFrom(env);
    requireValue(env.PROVIDER !== 'none' && providers.includes(env.PROVIDER) && records[phase]);
    const outputs = JSON.parse(env.OUTPUTS_JSON ?? '');
    assert.equal(outputs.delivered, 'true');
    assert.equal(outputs.provider, env.PROVIDER);
    assert.equal(outputs['event-type'], records[phase].event.eventType);
    assert.equal(outputs.status, records[phase].event.status);
    requireValue(/^[1-3]$/.test(outputs.attempts));
    await writePrivate(directory, `${phase}-delivery.json`, {
      provider: env.PROVIDER,
      delivered: true,
      attempts: Number(outputs.attempts),
    });
    core.info(`Expected ${phase} provider delivery verified.`);
    return;
  }
  if (command === 'assert') {
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
    assert.deepEqual(Object.keys(records).sort(), required.toSorted());
    for (const phase of required) {
      assertActionRecord({
        scenarioId: env.SCENARIO,
        phase,
        outputs: records[phase].outputs,
        outcome: records[phase].outcome,
        run,
      });
      if (env.PROVIDER !== 'none') requireValue(await exists(directory, `${phase}-delivery.json`));
    }
    const state = await request(`/sandbox/v1/runs/${run.runId}/state`, { token: run.controlToken });
    assert.equal(state.counts.builds, env.SCENARIO === 'build-create-error' ? 0 : 1);
    assert.equal(
      state.counts.deployments,
      scenario.deploy && env.SCENARIO !== 'deploy-create-error' ? 1 : 0,
    );
    if (env.SCENARIO === 'build-create-error') assert.equal(state.faultCounters['createBuild:'], 1);
    if (env.SCENARIO === 'deploy-create-error')
      assert.equal(state.faultCounters['createDeployment:'], 1);
    if (scenario.deploy && env.SCENARIO !== 'deploy-create-error') {
      const finalPhase = required.at(-1);
      const client =
        dependencies.client ?? managementClient(run, { fetcher, maskSecret: core.setSecret });
      const detail = await managementRead(
        client,
        `/deployments/${records[finalPhase].result.deploymentCode}`,
      );
      assert.equal(detail.buildCode, records.build.result.buildCode);
      assert.equal(detail.status, records[finalPhase].result.deploymentStatus);
      if (env.SCENARIO === 'green-prepare-canary') {
        const split = await managementRead(
          client,
          `/deployments/${records.followup.result.deploymentCode}/trafficsplit`,
        );
        requireValue(
          split.services?.some(
            (service) => service.code === 'commerce' && service.percentage === 10,
          ),
        );
      }
    }
    core.info(`Scenario ${env.SCENARIO} passed; ${required.length} producer events validated.`);
    await core.summary
      ?.addRaw(
        `### Integration scenario\n\n| Scenario | Provider | Producer events | Result |\n|---|---|---:|---|\n| ${env.SCENARIO} | ${env.PROVIDER} | ${required.length} | Passed |\n`,
      )
      .write();
    return;
  }
  throw new Error('Unknown integration command.');
}
