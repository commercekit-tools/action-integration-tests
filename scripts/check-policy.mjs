import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const workflowPaths = [
  '.github/workflows/ci.yml',
  '.github/workflows/integration.yml',
  '.github/workflows/_scenario.yml',
  '.github/workflows/cleanup.yml',
  '.github/workflows/build-approve-deploy.yml',
];
const compositePaths = ['build', 'deploy', 'notify', 'cleanup'].map(
  (name) => `.github/actions/${name}/action.yml`,
);
const compact = (value) => String(value).replace(/\s+/g, '');

export function readPolicyFiles() {
  const paths = [
    ...readdirSync('.github/workflows').map((name) => `.github/workflows/${name}`),
    ...compositePaths,
    'action-refs.json',
  ];
  return Object.fromEntries(paths.map((path) => [path, readFileSync(path, 'utf8')]));
}

export function validatePolicy(files) {
  const workflows = Object.keys(files).filter((path) => path.startsWith('.github/workflows/'));
  assert.deepEqual([...workflows].sort(), [...workflowPaths].sort(), 'Unreviewed workflow.');
  const pins = JSON.parse(files['action-refs.json']);
  assert.equal(Object.keys(pins).length, 7, 'Unexpected Action dependency.');
  for (const sha of Object.values(pins)) assert.match(sha, /^[a-f0-9]{40}$/);
  const docs = Object.fromEntries(
    [...workflowPaths, ...compositePaths].map((path) => [path, parse(files[path])]),
  );
  const seenActions = new Set();
  function walk(value, path) {
    if (!value || typeof value !== 'object') return;
    if (value.permissions) {
      assert.equal(typeof value.permissions, 'object', 'Only explicit read permissions allowed.');
      for (const [permission, access] of Object.entries(value.permissions)) {
        assert(['contents', 'packages', 'actions'].includes(permission), 'Unreviewed permission.');
        assert.equal(access, 'read', 'Write permissions and release automation are disabled.');
      }
    }
    if (value.uses) {
      if (!value.uses.startsWith('./')) {
        const [name, sha] = value.uses.split('@');
        assert.equal(sha, pins[name], 'Unreviewed or unpinned Action.');
        assert(sha && /^[a-f0-9]{40}$/.test(sha), 'Immutable Action pin required.');
        seenActions.add(name);
      } else {
        assert(
          [
            './.github/workflows/_scenario.yml',
            './.github/actions/build',
            './.github/actions/deploy',
            './.github/actions/notify',
            './.github/actions/cleanup',
          ].includes(value.uses),
          'Unreviewed local Action.',
        );
      }
    }
    if (value.run) {
      assert(
        !/\b(?:gh\s+release|git\s+(?:tag|push)|(?:npm|pnpm)\s+publish)\b/.test(value.run),
        'Release command prohibited.',
      );
      assert(!value.run.includes('${{'), 'Pass untrusted values through environment variables.');
    }
    if (value.env?.NODE_AUTH_TOKEN) {
      assert.match(value.run ?? '', /^pnpm install --frozen-lockfile$/);
      assert.equal(value.env.NODE_AUTH_TOKEN, '${{ secrets.GITHUB_TOKEN }}');
    }
    if (value['continue-on-error']) {
      assert(
        path.startsWith('.github/actions/') &&
          value.id === 'action' &&
          /^commercekit-tools\/ccv2-(build|deploy|build-cleanup)@/.test(value.uses ?? ''),
        'Only producer execution may defer failure to explicit assertions.',
      );
    }
    for (const child of Object.values(value)) walk(child, path);
  }
  for (const [path, doc] of Object.entries(docs)) walk(doc, path);
  assert.deepEqual([...seenActions].sort(), Object.keys(pins).sort());

  const ci = docs[workflowPaths[0]];
  assert.deepEqual(Object.keys(ci.on).sort(), ['pull_request', 'push', 'workflow_dispatch']);
  assert.deepEqual(ci.on.push, { branches: ['main'] });
  for (const step of ci.jobs.quality.steps) {
    assert(
      !/runner\.mjs|integration\.yml|\.github\/actions\//.test(step.run ?? step.uses ?? ''),
      'PR CI must remain offline.',
    );
  }
  assert(ci.jobs.quality.steps.some((step) => step.run === 'pnpm quality'));

  const entry = docs[workflowPaths[1]];
  assert.deepEqual(Object.keys(entry.on), ['workflow_dispatch']);
  assert.deepEqual(entry.on.workflow_dispatch.inputs.suite.options, ['smoke', 'full', 'providers']);
  assert.equal(entry.concurrency['cancel-in-progress'], false);
  assert.equal(
    compact(entry.jobs.plan.if),
    compact(
      "github.repository == 'commercekit-tools/action-integration-tests' && github.ref == 'refs/heads/main'",
    ),
  );
  assert.equal(entry.jobs.scenario.strategy['max-parallel'], 2);
  assert.equal(entry.jobs.scenario.strategy['fail-fast'], false);
  assert.equal(entry.jobs.scenario.uses, './.github/workflows/_scenario.yml');

  const scenario = docs[workflowPaths[2]];
  assert.deepEqual(Object.keys(scenario.on), ['workflow_call']);
  const job = scenario.jobs.scenario;
  assert.equal(
    compact(job.if),
    compact(
      "github.repository == 'commercekit-tools/action-integration-tests' && github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/main' && inputs.confirmation == 'RUN-COMMERCEKIT-SANDBOX-TESTS' && (inputs.provider == 'none' || inputs.provider-confirmation == 'SEND-COMMERCEKIT-TEST-NOTIFICATION')",
    ),
  );
  assert.equal(
    job.environment,
    "${{ inputs.provider == 'none' && 'sandbox-e2e' || 'provider-smoke' }}",
  );
  assert.equal(job['timeout-minutes'], 15);
  assert.equal(job.env.NOTIFICATION_WEBHOOK, undefined, 'Do not expose webhooks to installers.');
  const cleanup = job.steps.at(-1);
  assert.equal(cleanup.run, 'node scripts/runner.mjs cleanup');
  assert.equal(compact(cleanup.if), '${{always()}}');
  assert(
    job.steps.some(
      (step) =>
        step.run === 'node scripts/runner.mjs assert' && compact(step.if).includes('always()'),
    ),
  );
  const stages = job.steps
    .filter((step) => step.uses === './.github/actions/deploy')
    .map((step) => step.with.phase);
  assert.deepEqual(stages, ['initial', 'followup', 'final']);
  for (const name of ['build', 'deploy']) {
    const producer = docs[`.github/actions/${name}/action.yml`];
    const action = producer.runs.steps.find((step) => step.id === 'action');
    assert.equal(action.with['api-base-url'], 'https://ccv2.sandbox.commercekit.tools');
    assert.equal(action.with['poll-interval-seconds'], '10');
    assert.equal(action.with['timeout-minutes'], '1');
    assert.equal(producer.runs.steps.at(-1).run, 'node scripts/runner.mjs record');
    assert(compact(producer.runs.steps.at(-1).if).includes('always()'));
  }
  const cleanupEntry = docs['.github/workflows/cleanup.yml'];
  assert.deepEqual(Object.keys(cleanupEntry.on), ['workflow_dispatch']);
  assert.deepEqual(Object.keys(cleanupEntry.on.workflow_dispatch.inputs), ['confirmation']);
  assert.equal(cleanupEntry.on.workflow_dispatch.inputs.confirmation.required, true);
  assert.equal(cleanupEntry.concurrency['cancel-in-progress'], false);
  const cleanupJob = cleanupEntry.jobs.cleanup;
  assert.equal(
    compact(cleanupJob.if),
    compact(
      "github.repository == 'commercekit-tools/action-integration-tests' && github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/main' && inputs.confirmation == 'RUN-COMMERCEKIT-SANDBOX-TESTS'",
    ),
  );
  assert.equal(cleanupJob.environment, 'sandbox-e2e');
  assert.equal(cleanupJob['timeout-minutes'], 15);
  assert.equal(cleanupJob.env.SCENARIO, 'cleanup-dry-run');
  assert.equal(cleanupJob.env.PROVIDER, 'none');
  assert.equal(cleanupJob.env.NOTIFICATION_WEBHOOK, undefined);
  const cleanupLast = cleanupJob.steps.at(-1);
  assert.equal(cleanupLast.run, 'node scripts/runner.mjs cleanup');
  assert.equal(compact(cleanupLast.if), '${{always()}}');
  assert(
    cleanupJob.steps.some(
      (step) =>
        step.run === 'node scripts/runner.mjs assert-cleanup' &&
        compact(step.if).includes('always()'),
    ),
  );
  assert.deepEqual(
    cleanupJob.steps
      .filter((step) => step.uses === './.github/actions/cleanup')
      .map((step) => step.with.attempt),
    ['first', 'repeat'],
  );
  const cleanupComposite = docs['.github/actions/cleanup/action.yml'];
  const cleanupAction = cleanupComposite.runs.steps.find((step) => step.id === 'action');
  assert.equal(cleanupAction.with['api-base-url'], 'https://ccv2.sandbox.commercekit.tools');
  assert.equal(cleanupAction.with['subscription-code'], '131762872233634f29fdeb7d50983aa4');
  assert.equal(cleanupAction.with['dry-run'], 'true');
  assert.equal(cleanupAction.with['retention-days'], '30');
  assert.equal(cleanupAction.with['keep-latest'], '10');
  assert.equal(cleanupAction.with['max-deletions'], '20');
  assert.equal(cleanupAction.with['timeout-minutes'], '2');
  assert.equal(cleanupComposite.runs.steps.at(-1).run, 'node scripts/runner.mjs record-cleanup');
  assert(compact(cleanupComposite.runs.steps.at(-1).if).includes('always()'));
  const approvedEntry = docs['.github/workflows/build-approve-deploy.yml'];
  assert.deepEqual(Object.keys(approvedEntry.on), ['workflow_dispatch']);
  assert.deepEqual(Object.keys(approvedEntry.on.workflow_dispatch.inputs), ['confirmation']);
  assert.equal(approvedEntry.on.workflow_dispatch.inputs.confirmation.required, true);
  assert.equal(approvedEntry.concurrency['cancel-in-progress'], false);
  assert.equal(approvedEntry.concurrency.group, 'commercekit-action-integration');
  const approvedJobs = approvedEntry.jobs;
  assert.deepEqual(Object.keys(approvedJobs), [
    'repository-build',
    'commerce-check',
    'cloud-build',
    'deploy',
  ]);
  assert.equal(compact(approvedJobs['repository-build'].if), compact(cleanupJob.if));
  assert.equal(approvedJobs['commerce-check'].needs, 'repository-build');
  assert.equal(approvedJobs['cloud-build'].needs, 'commerce-check');
  assert.equal(approvedJobs.deploy.needs, 'cloud-build');
  assert.equal(approvedJobs.deploy.environment, 'sandbox-deploy-approval');
  for (const job of Object.values(approvedJobs)) {
    assert(job['timeout-minutes'] > 0 && job['timeout-minutes'] <= 10);
    assert.equal(job.env?.GITHUB_TOKEN, undefined);
  }
  const repository = approvedJobs['repository-build'];
  assert.equal(repository.permissions.actions, 'read');
  const repositoryCommands = repository.steps.map((step) => step.run);
  assert(repositoryCommands.includes('pnpm quality'));
  assert(
    repositoryCommands.indexOf('pnpm quality') <
      repositoryCommands.indexOf('node scripts/approval.mjs verify-environment'),
  );
  const checkSteps = approvedJobs['commerce-check'].steps;
  const setup = checkSteps.find((step) =>
    step.uses?.startsWith('commercekit-tools/setup-commercekit@'),
  );
  assert.equal(setup.with.version, '0.1.0-preview.2');
  assert(
    checkSteps.some((step) => step.run === 'commercekit check fixtures/commerce --format github'),
  );
  const cloud = approvedJobs['cloud-build'];
  assert.deepEqual(cloud.outputs, { 'build-code': '${{ steps.handoff.outputs.build-code }}' });
  const handoff = cloud.steps.find((step) => step.id === 'handoff');
  assert.equal(handoff.run, 'node scripts/runner.mjs handoff-build');
  assert(cloud.steps.some((step) => step.uses === './.github/actions/build'));
  const approved = approvedJobs.deploy;
  assert.equal(approved.outputs, undefined, 'No credential or private state handoff.');
  assert.equal(approved.permissions.actions, 'read');
  const approvedPrepare = approved.steps.find((step) => step.id === 'prepare');
  assert.equal(approvedPrepare.run, 'node scripts/runner.mjs prepare-approved-deploy');
  assert.equal(approvedPrepare.env.BUILT_BUILD_CODE, '${{ needs.cloud-build.outputs.build-code }}');
  assert(
    approved.steps.some(
      (step) => step.uses === './.github/actions/deploy' && step.with.phase === 'initial',
    ),
  );
  assert(
    approved.steps.some(
      (step) =>
        step.run === 'node scripts/runner.mjs assert-approved-deployment' &&
        compact(step.if).includes('always()'),
    ),
  );
  for (const job of [cloud, approved]) {
    assert.equal(job.env.SCENARIO, 'rolling-success');
    assert.equal(job.env.PROVIDER, 'none');
    assert.equal(job.env.CONFIRMATION, '${{ inputs.confirmation }}');
    const last = job.steps.at(-1);
    assert.equal(last.run, 'node scripts/runner.mjs cleanup');
    assert.equal(compact(last.if), '${{always()}}');
  }
  for (const job of [repository, approved]) {
    const verification = job.steps.find(
      (step) => step.run === 'node scripts/approval.mjs verify-environment',
    );
    assert(verification);
    assert.equal(verification.env.GITHUB_TOKEN, '${{ secrets.GITHUB_TOKEN }}');
    const prepareIndex = job.steps.findIndex((step) => step.id === 'prepare');
    assert(prepareIndex < 0 || job.steps.indexOf(verification) < prepareIndex);
  }
  const notify = docs['.github/actions/notify/action.yml'].runs.steps.find(
    (step) => step.id === 'action',
  );
  assert.equal(notify.with['fail-on-notification-error'], 'true');
  assert.equal(notify.with['event-file'], '${{ steps.inputs.outputs.event-file }}');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  validatePolicy(readPolicyFiles());
  console.log('Offline CI, manual live tests, pinned Actions and no-release policy passed.');
}
