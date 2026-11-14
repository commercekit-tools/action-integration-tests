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
