import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse, stringify } from 'yaml';
import { readPolicyFiles, validatePolicy } from '../scripts/check-policy.mjs';

function mutation(path, change) {
  const files = readPolicyFiles();
  const doc = parse(files[path]);
  change(doc);
  files[path] = stringify(doc);
  return files;
}

test('checked-in workflows preserve live-test and release boundaries', () => {
  assert.doesNotThrow(() => validatePolicy(readPolicyFiles()));
});

test('release triggers, write access, floating Actions and shell interpolation fail closed', () => {
  const path = '.github/workflows/ci.yml';
  const mutations = [
    (doc) => {
      doc.on.release = { types: ['published'] };
    },
    (doc) => {
      doc.permissions.contents = 'write';
    },
    (doc) => {
      doc.jobs.quality.steps[0].uses = 'actions/checkout@main';
    },
    (doc) => {
      doc.jobs.quality.steps.push({ run: 'gh release create v1' });
    },
    (doc) => {
      doc.jobs.quality.steps.push({ run: 'echo ${{ inputs.untrusted }}' });
    },
  ];
  for (const change of mutations) assert.throws(() => validatePolicy(mutation(path, change)));
});

test('automatic live runs, missing cleanup and disabled final assertions are rejected', () => {
  assert.throws(() =>
    validatePolicy(
      mutation('.github/workflows/integration.yml', (doc) => {
        doc.on.push = {};
      }),
    ),
  );
  for (const change of [
    (doc) => {
      doc.jobs.scenario.steps.at(-1).if = 'success()';
    },
    (doc) => {
      doc.jobs.scenario.if = 'true';
    },
    (doc) => {
      doc.jobs.scenario.steps = doc.jobs.scenario.steps.filter(
        (step) => step.run !== 'node scripts/runner.mjs assert',
      );
    },
    (doc) => {
      doc.jobs.scenario.env.NOTIFICATION_WEBHOOK = '${{ secrets.TEST_WEBHOOK }}';
    },
  ])
    assert.throws(() => validatePolicy(mutation('.github/workflows/_scenario.yml', change)));
});

test('cleanup stays manual, dry-run, fixed to Sandbox and always cleaned', () => {
  for (const change of [
    (doc) => {
      doc.on.schedule = [{ cron: '17 3 * * 0' }];
    },
    (doc) => {
      doc.on.workflow_dispatch.inputs['dry-run'] = { type: 'boolean', default: false };
    },
    (doc) => {
      doc.jobs.cleanup.if = 'true';
    },
    (doc) => {
      doc.jobs.cleanup.steps.at(-1).if = 'success()';
    },
    (doc) => {
      doc.jobs.cleanup.env.PROVIDER = 'slack';
    },
    (doc) => {
      doc.jobs.cleanup.steps = doc.jobs.cleanup.steps.filter(
        (step) => step.run !== 'node scripts/runner.mjs assert-cleanup',
      );
    },
  ])
    assert.throws(() => validatePolicy(mutation('.github/workflows/cleanup.yml', change)));
  for (const change of [
    (doc) => {
      doc.runs.steps[0].with['dry-run'] = 'false';
    },
    (doc) => {
      doc.runs.steps[0].with['api-base-url'] = 'https://invalid.example.test';
    },
    (doc) => {
      doc.runs.steps[0].with['max-deletions'] = '100';
    },
    (doc) => {
      doc.runs.steps.at(-1).if = 'success()';
    },
  ])
    assert.throws(() => validatePolicy(mutation('.github/actions/cleanup/action.yml', change)));
});

test('approved deploy requires ordered checks, a protected environment and public-code-only handoff', () => {
  for (const change of [
    (doc) => {
      doc.on.push = { branches: ['main'] };
    },
    (doc) => {
      doc.jobs['repository-build'].if = 'true';
    },
    (doc) => {
      doc.jobs['commerce-check'].needs = 'repository-build-typo';
    },
    (doc) => {
      doc.jobs['cloud-build'].needs = 'repository-build';
    },
    (doc) => {
      doc.jobs.deploy.needs = 'commerce-check';
    },
    (doc) => {
      delete doc.jobs.deploy.environment;
    },
    (doc) => {
      doc.jobs.deploy.environment = 'sandbox-e2e';
    },
    (doc) => {
      doc.jobs['cloud-build'].outputs.credentials = '${{ steps.prepare.outputs.credentials }}';
    },
    (doc) => {
      doc.jobs.deploy.steps.find((step) => step.id === 'prepare').env.BUILT_BUILD_CODE =
        '${{ inputs.build-code }}';
    },
    (doc) => {
      doc.jobs.deploy.steps.at(-1).if = 'success()';
    },
    (doc) => {
      doc.jobs['cloud-build'].steps.at(-1).if = 'success()';
    },
    (doc) => {
      doc.jobs.deploy.steps = doc.jobs.deploy.steps.filter(
        (step) => step.run !== 'node scripts/approval.mjs verify-environment',
      );
    },
    (doc) => {
      doc.jobs['commerce-check'].steps.find((step) =>
        step.uses?.startsWith('commercekit-tools/setup-commercekit@'),
      ).with.version = 'latest';
    },
  ])
    assert.throws(() =>
      validatePolicy(mutation('.github/workflows/build-approve-deploy.yml', change)),
    );
});
