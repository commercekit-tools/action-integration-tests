/** Opt-in local candidate integration. Never dispatches a workflow or sends provider requests. */
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { lstat, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as contract from '@commercekit-tools/notification-contract';
import { createRequire } from 'node:module';
const requirePublic = createRequire(import.meta.url);
const metadata = requirePublic('@commercekit-tools/notification-contract/package.json');
const publicSchema = requirePublic('@commercekit-tools/notification-contract/schema');
import {
  actionMetadata,
  assertCandidateManifest,
  assertLoopbackOrigin,
  assertSummary,
  candidateActionNames,
  effectiveInputs,
  localSandboxFetch,
  plainSummary,
  resolveCandidatePath,
  runCandidateBundle,
  sandboxOrigin,
  sha256,
  sourceProvenance,
} from './candidate-support.mjs';
import {
  assertActionRecord,
  assertCleanupRecord,
  controlRequest,
  nextDeployInputs,
  runCommand,
  subscription,
} from './runtime.mjs';
import { getScenario, reportingCandidateScenarioIds } from './scenarios.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const maximumRuntimeMs = 270000;
const payloadText = (value) =>
  typeof value === 'string'
    ? plainSummary(value)
    : value && typeof value === 'object'
      ? Object.values(value).map(payloadText).join(' ')
      : '';

function testCore() {
  const outputs = {},
    exported = {},
    masked = [];
  return {
    outputs,
    exported,
    masked,
    setOutput: (name, value) => {
      outputs[name] = value;
    },
    exportVariable: (name, value) => {
      exported[name] = value;
    },
    setSecret: (value) => {
      masked.push(value);
    },
    info: () => {},
    summary: { addRaw: () => ({ write: async () => {} }) },
  };
}
function scenarioEnvironment(directory, scenario) {
  return {
    STATE_DIRECTORY: directory,
    SCENARIO: scenario,
    PROVIDER: 'none',
    CONFIRMATION: 'RUN-COMMERCEKIT-SANDBOX-TESTS',
    GITHUB_EVENT_NAME: 'workflow_dispatch',
    GITHUB_REPOSITORY: 'commercekit-tools/action-integration-tests',
    GITHUB_REF: 'refs/heads/main',
    GITHUB_RUN_ID: '123',
    GITHUB_RUN_ATTEMPT: '1',
  };
}
function mutationCounts(state) {
  return Object.fromEntries(
    Object.entries(state.faultCounters).filter(([name]) => /^(?:create|delete|update)/.test(name)),
  );
}
function eventContext(event) {
  return (
    event.data.inputContext ??
    (event.data.inputs
      ? {
          inputs: event.data.inputs,
          inputsValidated: event.data.inputsValidated,
          inputsTruncated: event.data.inputsTruncated,
        }
      : undefined)
  );
}
function assertProducerContext(event, markdown, definition, secrets) {
  const context = eventContext(event);
  assert(
    context &&
      typeof context.inputsValidated === 'boolean' &&
      typeof context.inputsTruncated === 'boolean',
  );
  assert.deepEqual(Object.keys(context.inputs).sort(), Object.keys(definition.inputs).sort());
  for (const name of Object.keys(definition.inputs))
    if (contract.isConfidentialInputName(name)) assert.equal(context.inputs[name], '[REDACTED]');
  const text = JSON.stringify(event);
  assert.equal(contract.redactJwtLikeTokens(text), text);
  assert.equal(contract.redactJwtLikeTokens(markdown), markdown);
  for (const secret of secrets.filter(Boolean))
    assert(!text.includes(secret), 'Credential leaked in event.');
  assertSummary(
    markdown,
    event.status,
    contract.getNotificationStyle(event.status),
    Object.keys(definition.inputs),
    secrets,
  );
  if (event.data.error) {
    assert(markdown.includes('### Issues'));
    if (event.data.error.code) assert(plainSummary(markdown).includes(event.data.error.code));
  }
  for (const issue of event.data.issues ?? []) {
    assert(markdown.includes('### Issues'));
    if (issue.code) assert(plainSummary(markdown).includes(issue.code));
  }
  return context;
}

async function verifyArtifacts(manifest) {
  assertCandidateManifest(manifest);
  assert.equal(process.versions.node.split('.')[0], '24');
  assert.equal(metadata.version, '0.0.6');
  const own = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  assert.equal(own.private, true);
  assert.equal(
    own.dependencies['@commercekit-tools/notification-contract'],
    `file:${manifest.contract.tarball}`,
  );
  const tarballStat = await lstat(manifest.contract.tarball);
  assert(tarballStat.isFile() && !tarballStat.isSymbolicLink() && tarballStat.size <= 1024 * 1024);
  const bytes = await readFile(manifest.contract.tarball);
  assert.equal(sha256(bytes), manifest.contract.sha256);
  assert.equal(
    `sha512-${createHash('sha512').update(bytes).digest('base64')}`,
    manifest.contract.integrity,
  );
  for (const name of [
    'parseNotificationEventJson',
    'createBuildCleanupEvent',
    'createSetupEvent',
    'getNotificationStyle',
    'renderActionSummary',
    'captureActionInputs',
    'createActionInputContext',
    'isConfidentialInputName',
  ])
    assert.equal(typeof contract[name], 'function', 'Required public contract export missing.');
  assert(publicSchema.properties.eventType.enum.includes('commercekit.setup.completed'));
  const installed = dirname(
    fileURLToPath(import.meta.resolve('@commercekit-tools/notification-contract/package.json')),
  );
  const entries = execFileSync('tar', ['-tzf', manifest.contract.tarball], {
    encoding: 'utf8',
    maxBuffer: 65536,
  })
    .trim()
    .split('\n');
  assert(entries.length > 0 && entries.length <= 100);
  for (const entry of entries) {
    assert(
      entry.startsWith('package/') && !entry.split('/').includes('..') && !entry.endsWith('/'),
    );
    const packed = execFileSync('tar', ['-xOf', manifest.contract.tarball, entry], {
      maxBuffer: 1024 * 1024,
    });
    assert((await readFile(join(installed, entry.slice('package/'.length)))).equals(packed));
  }
  const sources = {};
  for (const [name, item] of Object.entries({
    contract: manifest.contract,
    sandbox: manifest.sandbox,
    ...manifest.actions,
  })) {
    const proof = await sourceProvenance(item.sourcePath);
    assert.equal(proof.sourceSha, item.sourceSha);
    assert.equal(proof.sourceHash, item.sourceHash);
    sources[name] = proof;
    if (manifest.actions[name]) {
      const consumerProof = await sourceProvenance(item.consumerPath, { allowUnborn: true });
      assert.equal(
        consumerProof.runtimeHash,
        proof.runtimeHash,
        'Candidate runtime source differs from reviewed source.',
      );
      assert.equal(
        sha256(await readFile(join(item.consumerPath, 'dist/index.js'))),
        item.bundleSha256,
      );
      sources[name].bundleSha256 = item.bundleSha256;
      sources[name].consumerRuntimeHash = consumerProof.runtimeHash;
      const consumer = JSON.parse(await readFile(join(item.consumerPath, 'package.json'), 'utf8'));
      assert.equal(consumer.private, true);
      assert.equal(
        consumer.dependencies['@commercekit-tools/notification-contract'],
        `file:${manifest.contract.tarball}`,
      );
      assert.deepEqual(
        consumer.scripts,
        JSON.parse(await readFile(join(item.sourcePath, 'package.json'), 'utf8')).scripts,
      );
    }
  }
  return sources;
}

async function stopLocalSandbox(child) {
  const kill = (signal) => {
    try {
      if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, signal);
      else child.kill(signal);
    } catch {
      /* Owned local process group may already have exited. */
    }
  };
  kill('SIGTERM');
  await Promise.race([
    new Promise((done) => child.once('exit', done)),
    new Promise((done) => setTimeout(done, 2000)),
  ]);
  kill('SIGKILL');
}

async function startLocalSandbox(manifest, temporary, localOrigin, signal) {
  const url = new URL(assertLoopbackOrigin(localOrigin));
  const cert = join(temporary, 'cert.pem'),
    key = join(temporary, 'key.pem');
  execFileSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-keyout',
      key,
      '-out',
      cert,
      '-days',
      '1',
      '-subj',
      '/CN=localhost',
      '-addext',
      'subjectAltName=DNS:localhost,IP:127.0.0.1',
    ],
    { stdio: 'ignore' },
  );
  const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const vars = {
    MOCK_JWT_ISSUER: sandboxOrigin,
    MOCK_JWT_PRIVATE_KEY: pair.privateKey.export({ format: 'pem', type: 'pkcs8' }),
    MOCK_JWT_PUBLIC_JWK: JSON.stringify(pair.publicKey.export({ format: 'jwk' })),
    MOCK_JWT_KID: 'reporting-local-candidate',
    RUN_TOKEN_SIGNING_KEY: 'synthetic-reporting-candidate-local-only-signing-key',
  };
  const envFile = join(temporary, 'sandbox.env');
  await writeFile(
    envFile,
    Object.entries(vars)
      .map(
        ([name, value]) =>
          `${name}=${name === 'MOCK_JWT_PUBLIC_JWK' ? "'" + value + "'" : JSON.stringify(value)}`,
      )
      .join('\n'),
    { mode: 0o600 },
  );
  const app = join(manifest.sandbox.sourcePath, 'apps/ccv2');
  const child = spawn(
    process.execPath,
    [
      join(app, 'node_modules/wrangler/bin/wrangler.js'),
      'dev',
      '--local',
      '--ip',
      '127.0.0.1',
      '--port',
      url.port,
      '--inspector-port',
      '0',
      '--local-protocol',
      'https',
      '--https-key-path',
      key,
      '--https-cert-path',
      cert,
      '--env-file',
      envFile,
      '--persist-to',
      join(temporary, 'sandbox-state'),
      '--show-interactive-dev-session=false',
    ],
    {
      cwd: app,
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        WRANGLER_LOG_PATH: join(temporary, 'wrangler.log'),
        WRANGLER_SEND_METRICS: 'false',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
    },
  );
  child.stdout.resume();
  child.stderr.resume();
  const fetcher = localSandboxFetch(localOrigin, await readFile(cert), signal);
  try {
    for (let attempt = 0; attempt < 120; attempt++) {
      signal.throwIfAborted();
      assert(child.exitCode === null, 'Local worker exited during startup.');
      try {
        if ((await fetcher(`${sandboxOrigin}/sandbox/v1/health`)).status === 200)
          return { child, cert, fetcher };
      } catch {
        /* bounded local startup */
      }
      await new Promise((done) => setTimeout(done, 250));
    }
    throw new Error('Local Sandbox did not become ready.');
  } catch (error) {
    await stopLocalSandbox(child);
    throw error;
  }
}

export async function validateReportingCandidates(manifest, localOrigin) {
  assertLoopbackOrigin(localOrigin); // Validate before artifact reads, network, or subprocesses.
  const sources = await verifyArtifacts(manifest);
  const harnessSource = await sourceProvenance(root, { allowUnborn: true });
  const definitions = Object.fromEntries(
    await Promise.all(
      candidateActionNames.map(async (name) => [
        name,
        await actionMetadata(manifest.actions[name].sourcePath),
      ]),
    ),
  );
  const started = Date.now();
  const temporary = await mkdtemp(join(tmpdir(), 'commercekit-reporting-candidate-'));
  const cancellation = new AbortController();
  const timer = setTimeout(() => cancellation.abort(), maximumRuntimeMs);
  const cancel = () => cancellation.abort();
  process.once('SIGINT', cancel);
  process.once('SIGTERM', cancel);
  const evidence = {
    schemaVersion: 1,
    classification: 'unpublished-source-candidate',
    outcome: 'FAIL',
    sources,
    harnessSource,
    harnessCode: Object.fromEntries(
      await Promise.all(
        [
          'validate-reporting-candidates.mjs',
          'candidate-support.mjs',
          'candidate-fetch-preload.mjs',
          'scenarios.mjs',
          'runtime.mjs',
        ].map(async (file) => [file, sha256(await readFile(join(root, 'scripts', file)))]),
      ),
    ),
    contract: {
      version: metadata.version,
      sha256: manifest.contract.sha256,
      integrity: manifest.contract.integrity,
    },
    scenarios: [],
    localOnly: true,
    providerRequestsMocked: true,
    hostedDispatches: 0,
    realSapCalls: 0,
    validatedRunsCreated: 0,
    validatedRunsRemoved: 0,
  };
  let server, active;
  let stage = 'startup';
  const preload = join(root, 'scripts/candidate-fetch-preload.mjs');
  const capturedEvents = [];
  let sequence = 0;
  const action = async (name, inputs, mode = 'sandbox', mockStatus = 200) => {
    cancellation.signal.throwIfAborted();
    const observed = await runCandidateBundle({
      action: manifest.actions[name],
      directory: join(temporary, `action-${sequence++}`),
      inputs: effectiveInputs(definitions[name], inputs),
      mode,
      localOrigin,
      caFile: server.cert,
      preload,
      signal: cancellation.signal,
      mockStatus,
    });
    evidence.lastChild = {
      action: name,
      exitCode: observed.code,
      network: observed.network,
      summaryBytes: Buffer.byteLength(observed.summary),
    };
    return observed;
  };
  const cleanupActive = async () => {
    if (!active) return;
    const fetcher = localSandboxFetch(
      localOrigin,
      await readFile(server.cert),
      AbortSignal.timeout(15000),
    );
    await runCommand('cleanup', active.env, active.core, { fetcher });
    if (active.validated) evidence.validatedRunsRemoved++;
    active = undefined;
  };
  const readState = async (run) =>
    await controlRequest(`/sandbox/v1/runs/${run.runId}/state`, {
      token: run.controlToken,
      fetcher: server.fetcher,
    });
  try {
    server = await startLocalSandbox(manifest, temporary, localOrigin, cancellation.signal);
    for (const scenarioId of reportingCandidateScenarioIds) {
      stage = scenarioId;
      const env = scenarioEnvironment(join(temporary, `run-${scenarioId}`), scenarioId);
      const core = testCore();
      active = { env, core };
      try {
        stage = `${scenarioId}:prepare`;
        await runCommand('prepare', env, core, { fetcher: server.fetcher });
        const run = JSON.parse(await readFile(join(env.STATE_DIRECTORY, 'run.json'), 'utf8'));
        active.validated = true;
        evidence.validatedRunsCreated++;
        const knownSecrets = [run.controlToken, ...Object.values(run.credentials)];
        const authentication = {
          'token-endpoint': run.credentials.tokenUrl,
          'client-id': run.credentials.clientId,
          'client-secret': run.credentials.clientSecret,
          resource: run.credentials.resource,
          'subscription-code': subscription,
          'api-base-url': sandboxOrigin,
        };
        const before = await readState(run);
        if (scenarioId === 'cleanup-dry-run') {
          const cleanupInputs = {
            ...authentication,
            'application-code': 'commerce',
            'retention-days': '30',
            'keep-latest': '10',
            'max-deletions': '20',
            'exclude-build-codes': 'cleanup-006',
            'dry-run': 'true',
            'timeout-minutes': '2',
            'continue-on-delete-error': 'false',
          };
          let first;
          for (const attempt of ['first', 'repeat']) {
            stage = `${scenarioId}:${attempt}:execute`;
            const observed = await action('ccv2-build-cleanup', cleanupInputs);
            stage = `${scenarioId}:${attempt}:assert`;
            const state = await readState(run);
            const record = assertCleanupRecord({
              outputs: observed.outputs,
              outcome: observed.code === 0 ? 'success' : 'failure',
              run,
              state,
              notificationStatus: 'warning',
            });
            assert.deepEqual(record.event.data.inputs, record.result.inputs);
            assertProducerContext(
              record.event,
              observed.summary,
              definitions['ccv2-build-cleanup'],
              knownSecrets,
            );
            assert.equal(record.event.data.protectedCount, record.result.counts.protected);
            assert.equal(
              record.event.data.blockedCount,
              record.result.decisions.filter((decision) => decision.disposition === 'blocked')
                .length,
            );
            assert.deepEqual(mutationCounts(state), mutationCounts(before));
            assert.equal(observed.network.blocked, 0);
            if (first) {
              assert.deepEqual(record.result.counts, first.result.counts);
              assert.deepEqual(record.result.decisions, first.result.decisions);
            } else {
              first = record;
              capturedEvents.push({
                event: record.event,
                names: Object.keys(definitions['ccv2-build-cleanup'].inputs),
                secrets: knownSecrets,
              });
            }
            evidence.scenarios.push({
              action: 'ccv2-build-cleanup',
              scenario: attempt,
              status: record.event.status,
              targetMutations: 0,
              summarySha256: sha256(observed.summary),
            });
          }
        } else {
          stage = `${scenarioId}:build-execute`;
          const build = await action('ccv2-build', {
            ...authentication,
            branch: 'main',
            'build-name': core.outputs['build-name'],
            'application-code': 'commerce',
            'poll-interval-seconds': '10',
            'timeout-minutes': '1',
          });
          stage = `${scenarioId}:build-assert`;
          const record = assertActionRecord({
            scenarioId,
            phase: 'build',
            outputs: build.outputs,
            outcome: build.code === 0 ? 'success' : 'failure',
            run,
          });
          assert.deepEqual(record.event.data.inputs, record.result.inputs);
          assertProducerContext(
            record.event,
            build.summary,
            definitions['ccv2-build'],
            knownSecrets,
          );
          assert.equal(build.network.blocked, 0);
          capturedEvents.push({
            event: record.event,
            names: Object.keys(definitions['ccv2-build'].inputs),
            secrets: knownSecrets,
          });
          evidence.scenarios.push({
            action: 'ccv2-build',
            scenario: scenarioId,
            status: record.event.status,
            summarySha256: sha256(build.summary),
          });
          const records = { build: record };
          if (getScenario(scenarioId).deploy) {
            const planned = nextDeployInputs(scenarioId, 'initial', records);
            delete planned.enabled;
            stage = `${scenarioId}:deploy-execute`;
            const deploy = await action('ccv2-deploy', {
              ...authentication,
              ...planned,
              'poll-interval-seconds': '10',
              'timeout-minutes': '1',
            });
            stage = `${scenarioId}:deploy-assert`;
            records.initial = assertActionRecord({
              scenarioId,
              phase: 'initial',
              outputs: deploy.outputs,
              outcome: deploy.code === 0 ? 'success' : 'failure',
              run,
            });
            assert.deepEqual(records.initial.event.data.inputs, records.initial.result.inputs);
            assertProducerContext(
              records.initial.event,
              deploy.summary,
              definitions['ccv2-deploy'],
              knownSecrets,
            );
            assert.equal(deploy.network.blocked, 0);
            capturedEvents.push({
              event: records.initial.event,
              names: Object.keys(definitions['ccv2-deploy'].inputs),
              secrets: knownSecrets,
            });
            evidence.scenarios.push({
              action: 'ccv2-deploy',
              scenario: scenarioId,
              status: records.initial.event.status,
              summarySha256: sha256(deploy.summary),
            });
          } else assert.equal(nextDeployInputs(scenarioId, 'initial', records).enabled, 'false');
          stage = `${scenarioId}:mutation-counts`;
          const after = await readState(run);
          assert.equal(after.counts.builds, 1);
          assert.equal(after.counts.deployments, getScenario(scenarioId).deploy ? 1 : 0);
          assert.equal(
            Object.entries(after.faultCounters)
              .filter(([name]) => name.startsWith('createBuild:'))
              .reduce((sum, [, count]) => sum + count, 0),
            1,
          );
          assert.equal(
            Object.entries(after.faultCounters)
              .filter(([name]) => name.startsWith('createDeployment:'))
              .reduce((sum, [, count]) => sum + count, 0),
            getScenario(scenarioId).deploy ? 1 : 0,
          );
        }
      } finally {
        await cleanupActive();
      }
    }
    stage = 'setup-invalid-input';
    const setup = await action(
      'setup-commercekit',
      { version: 'invalid candidate version' },
      'deny',
    );
    assert.equal(setup.code, 1);
    assert.equal(setup.network.attempted, 0);
    const setupEvent = contract.parseNotificationEventJson(setup.outputs['notification-event']);
    assert.equal(setupEvent.status, 'failure');
    assertProducerContext(setupEvent, setup.summary, definitions['setup-commercekit'], []);
    capturedEvents.push({
      event: setupEvent,
      names: Object.keys(definitions['setup-commercekit'].inputs),
      secrets: [],
    });
    evidence.scenarios.push({
      action: 'setup-commercekit',
      scenario: 'invalid-input',
      status: setupEvent.status,
      networkCalls: 0,
      summarySha256: sha256(setup.summary),
    });
    for (const { event, names, secrets } of capturedEvents)
      for (const provider of ['slack', 'teams-workflow']) {
        stage = `notify-${provider}-${event.status}`;
        const webhook =
          provider === 'slack'
            ? 'https://' + 'hooks.slack.com/services/candidate/candidate/candidate'
            : 'https://provider.example.test/candidate';
        const delivery = await action(
          'notify',
          {
            provider,
            'event-json': JSON.stringify(event),
            'webhook-url': webhook,
            'fail-on-notification-error': 'true',
          },
          'provider-mock',
        );
        assert.equal(delivery.code, 0);
        assert.equal(delivery.outputs.delivered, 'true');
        assert.equal(delivery.outputs.status, event.status);
        assert.equal(delivery.network.mockProvider, 1);
        assert.equal(delivery.network.blocked, 0);
        const payload = JSON.stringify(delivery.payload);
        assert.equal(contract.redactJwtLikeTokens(payload), payload);
        const style = contract.getNotificationStyle(event.status);
        assert(payload.includes(style.icon) && payload.includes(style.label));
        for (const name of names)
          assert(payload.includes(name), 'Producer input missing from provider payload.');
        assert(!payload.includes(webhook));
        for (const secret of secrets.filter(Boolean))
          assert(!payload.includes(secret), 'Credential leaked in provider payload.');
        for (const issue of [
          ...(event.data.error ? [event.data.error] : []),
          ...(event.data.issues ?? []),
        ]) {
          const displayed = payloadText(delivery.payload);
          if (issue.code) assert(displayed.includes(issue.code));
          assert(displayed.includes(issue.message.slice(0, 80)));
        }
        if (provider === 'teams-workflow') assert(Buffer.byteLength(payload) <= 27 * 1024);
        else
          assert(
            delivery.payload.blocks.length + delivery.payload.attachments[0].blocks.length <= 50,
          );
        assertSummary(
          delivery.summary,
          'success',
          contract.getNotificationStyle('success'),
          Object.keys(definitions.notify.inputs),
          [webhook],
        );
        if (provider === 'slack') assert.equal(delivery.payload.attachments[0].color, style.accent);
        else
          assert.equal(
            delivery.payload.attachments[0].content.body[0].style,
            {
              success: 'good',
              warning: 'warning',
              'action-required': 'warning',
              failure: 'attention',
              'internal-error': 'attention',
            }[event.status],
          );
        evidence.scenarios.push({
          action: 'notify',
          provider,
          sourceStatus: event.status,
          delivered: true,
          mockedRequests: 1,
          summarySha256: sha256(delivery.summary),
        });
      }
    for (const failOn of ['false', 'true']) {
      stage = `notify-delivery-${failOn === 'true' ? 'failure' : 'warning'}`;
      const event = capturedEvents[0].event;
      const delivery = await action(
        'notify',
        {
          provider: 'teams-workflow',
          'event-json': JSON.stringify(event),
          'webhook-url': 'https://provider.example.test/candidate',
          'fail-on-notification-error': failOn,
        },
        'provider-mock',
        400,
      );
      assert.equal(delivery.code, failOn === 'true' ? 1 : 0);
      assert.equal(delivery.outputs.delivered, 'false');
      assert.equal(delivery.network.mockProvider, 1);
      const status = failOn === 'true' ? 'failure' : 'warning';
      assertSummary(
        delivery.summary,
        status,
        contract.getNotificationStyle(status),
        Object.keys(definitions.notify.inputs),
      );
      assert(delivery.summary.includes('### Issues'));
      evidence.scenarios.push({
        action: 'notify',
        scenario: 'delivery-error',
        status,
        mockedRequests: 1,
        summarySha256: sha256(delivery.summary),
      });
    }
    assert.equal(evidence.validatedRunsCreated, 4);
    assert.equal(evidence.validatedRunsRemoved, 4);
    evidence.outcome = 'PASS';
  } catch {
    evidence.failureStage = stage;
  } finally {
    clearTimeout(timer);
    process.removeListener('SIGINT', cancel);
    process.removeListener('SIGTERM', cancel);
    try {
      await cleanupActive();
    } catch {
      evidence.outcome = 'FAIL';
      evidence.cleanupFailed = true;
    }
    if (server?.child) await stopLocalSandbox(server.child);
    await rm(temporary, { recursive: true, force: true });
  }
  evidence.durationMs = Date.now() - started;
  const reportDirectory = await mkdtemp(join(tmpdir(), 'commercekit-reporting-evidence-'));
  const report = join(reportDirectory, 'validation.json');
  await writeFile(report, JSON.stringify(evidence, null, 2) + '\n', { mode: 0o600 });
  console.log(`${evidence.outcome}: local candidate ecosystem validation. Evidence: ${report}`);
  assert.equal(
    evidence.outcome,
    'PASS',
    `Candidate validation failed at ${evidence.failureStage ?? 'cleanup'}.`,
  );
  return evidence;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const path = resolveCandidatePath(process.env.REPORTING_CANDIDATE_MANIFEST);
    assert((await lstat(path)).size <= 65536);
    const manifest = JSON.parse(await readFile(path, 'utf8'));
    await validateReportingCandidates(
      manifest,
      process.env.REPORTING_CANDIDATE_LOCAL_ORIGIN ?? 'https://localhost:18987',
    );
  } catch {
    console.error(
      'Candidate reporting validation failed. No raw Action output, provider response or credentials are logged.',
    );
    process.exitCode = 1;
  }
}
