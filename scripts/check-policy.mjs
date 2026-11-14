import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const workflowPaths = [
  '.github/workflows/ci.yml',
  '.github/workflows/integration.yml',
  '.github/workflows/_scenario.yml',
];
const compositePaths = ['build', 'deploy', 'notify'].map(
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
  assert.equal(Object.keys(pins).length, 5, 'Unexpected Action dependency.');
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
        assert(['contents', 'packages'].includes(permission), 'Unreviewed permission.');
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
          /^commercekit-tools\/ccv2-(build|deploy)@/.test(value.uses ?? ''),
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
