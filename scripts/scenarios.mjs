const base = {
  build: { outcome: 'SUCCESS', pollsBeforeTerminal: 1, logsAvailable: true },
  deployment: {
    outcome: 'DEPLOYED',
    pollsBeforeTerminal: 1,
    cancellationAllowed: true,
    requireGreenDecision: false,
  },
  faults: [],
};

const definitions = {
  'rolling-success': {},
  'build-failure': { build: 'FAIL', buildExpected: 'failure' },
  'build-timeout': { build: 'NEVER', buildExpected: 'internal-error' },
  'build-rate-limit': { fault: ['getBuildProgress', 429] },
  'build-create-error': { fault: ['createBuild', 500], buildExpected: 'internal-error' },
  'rolling-failure': { deployment: 'FAIL', expected: 'failure' },
  'deploy-timeout': { deployment: 'NEVER', expected: 'internal-error' },
  'deploy-rate-limit': { fault: ['getDeploymentProgress', 429] },
  'deploy-create-error': { fault: ['createDeployment', 500], expected: 'internal-error' },
  'green-manual': { green: true, expected: 'action-required' },
  'green-accept': {
    green: true,
    expected: 'action-required',
    followup: { operation: 'decide', decision: 'ACCEPT', expected: 'success' },
  },
  'green-prepare-canary': {
    green: true,
    expected: 'action-required',
    followup: { operation: 'decide', decision: 'PREPARE_CANARY', expected: 'action-required' },
    final: { operation: 'decide', decision: 'ACCEPT', expected: 'success' },
  },
  'green-reject': {
    green: true,
    expected: 'action-required',
    followup: { operation: 'decide', decision: 'REJECT', expected: 'cancelled' },
  },
  cancel: {
    deployment: 'NEVER',
    expected: 'internal-error',
    followup: { operation: 'cancel', expected: 'cancelled' },
  },
  resume: {
    green: true,
    expected: 'action-required',
    followup: { operation: 'resume', expected: 'action-required' },
    final: { operation: 'decide', decision: 'ACCEPT', expected: 'success' },
  },
  'green-inline-accept': { green: true, decision: 'ACCEPT' },
};

export const scenarioIds = Object.freeze(Object.keys(definitions));
export const providers = Object.freeze(['none', 'slack', 'teams-workflow']);
export const phases = Object.freeze(['build', 'initial', 'followup', 'final']);
export const cleanupScenarioId = 'cleanup-dry-run';
export const cleanupPolicy = Object.freeze({ retentionDays: 30, keepLatest: 10, maxDeletions: 20 });
export const cleanupBuildCode = (index) => `cleanup-${String(index).padStart(3, '0')}`;

/** Standalone cleanup fixture; deliberately excluded from the existing sixteen-flow suite. */
export function getCleanupFixture(now = Date.now()) {
  if (!Number.isFinite(now)) throw new Error('Invalid cleanup fixture clock.');
  const old = now - 365 * 86400000;
  const builds = Array.from({ length: 105 }, (_, index) => ({
    code: cleanupBuildCode(index),
    response: {
      code: cleanupBuildCode(index),
      subscriptionCode: '131762872233634f29fdeb7d50983aa4',
      applicationCode: 'commerce',
      status: 'SUCCESS',
      buildStartTimestamp: new Date(old + Math.min(index, 103) * 60000).toISOString(),
      buildEndTimestamp: new Date(old + (60 + index) * 60000).toISOString(),
      deployed: false,
      hasSnapshot: false,
    },
    modifiedAt: new Date(old).toISOString(),
  }));
  builds[0].response.deployed = true;
  builds[1].response.hasSnapshot = true;
  builds[2].response.status = 'BUILDING';
  builds[3].response.status = 'UNKNOWN';
  builds[4].response.status = 'DELETED';
  builds[5].response.buildEndTimestamp = new Date(now - 86400000).toISOString();
  builds[9].response.status = 'FAIL';
  delete builds[10].response.buildEndTimestamp;
  delete builds[11].response.hasSnapshot;
  builds[12].response.status = 'FAIL';
  // Simulator metadata is not a SAP last-modification field or enforcement guarantee.
  builds[13].modifiedAt = new Date(now - 3600000).toISOString();
  const deployments = [
    ['scheduled', 7, 'd1', 'SCHEDULED'],
    ['current', 8, 's1', 'DEPLOYED'],
    ['historical', 9, 'p1', 'FAIL'],
  ].map(([code, index, environmentCode, status]) => ({
    code,
    response: {
      code,
      subscriptionCode: '131762872233634f29fdeb7d50983aa4',
      buildCode: cleanupBuildCode(index),
      environmentCode,
      status,
      strategy: 'ROLLING_UPDATE',
      isCanaryAvailable: false,
      createdTimestamp: new Date(old).toISOString(),
    },
  }));
  return { builds, deployments };
}

export function getCleanupExpectations() {
  return {
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
    protectedCodes: [4, 5, 10, ...Array.from({ length: 10 }, (_, index) => 95 + index)].map(
      cleanupBuildCode,
    ),
    reasons: {
      deployed: [0],
      'snapshot-or-backup-reference': [1],
      'active-build': [2, 3],
      'already-marked-for-deletion': [4],
      'retained-age': [5],
      'explicitly-excluded': [6],
      'active-deployment-reference': [7, 8],
      'missing-timestamp': [10],
      'retained-latest': Array.from({ length: 10 }, (_, index) => 95 + index),
    },
  };
}

export function getScenario(id) {
  if (id === cleanupScenarioId)
    return { id, configuration: structuredClone(base), cleanup: true, deploy: false };
  if (!Object.hasOwn(definitions, id)) throw new Error('Unknown integration scenario.');
  const definition = definitions[id];
  const configuration = structuredClone(base);
  if (definition.build) configuration.build.outcome = definition.build;
  if (definition.deployment) configuration.deployment.outcome = definition.deployment;
  configuration.deployment.requireGreenDecision = definition.green === true;
  if (definition.fault) {
    const [operationId, status] = definition.fault;
    configuration.faults.push({
      operationId,
      status,
      onCalls: [1],
      ...(status === 429 ? { retryAfterSeconds: 1 } : {}),
    });
  }
  const buildExpected = definition.buildExpected ?? 'success';
  return {
    id,
    configuration,
    buildExpected,
    deploy: buildExpected === 'success',
    strategy: definition.green ? 'GREEN' : 'ROLLING_UPDATE',
    initial: {
      operation: 'deploy',
      decision: definition.decision ?? 'MANUAL',
      expected: definition.expected ?? 'success',
    },
    followup: definition.followup,
    final: definition.final,
  };
}

export function makePlan(suite) {
  if (suite === 'smoke')
    return {
      include: ['rolling-success', 'green-accept'].map((scenario) => ({
        scenario,
        provider: 'none',
      })),
    };
  if (suite === 'full')
    return { include: scenarioIds.map((scenario) => ({ scenario, provider: 'none' })) };
  if (suite === 'providers')
    return {
      include: ['rolling-success', 'build-failure', 'rolling-failure', 'green-manual'].flatMap(
        (scenario) => ['slack', 'teams-workflow'].map((provider) => ({ scenario, provider })),
      ),
    };
  throw new Error('Unknown integration suite.');
}
