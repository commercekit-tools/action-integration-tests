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

export function getScenario(id) {
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
