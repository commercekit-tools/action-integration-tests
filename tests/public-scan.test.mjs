import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scanText } from '../scripts/scan-public.mjs';

test('public scan rejects credentials without echoing them', () => {
  for (const unsafe of [
    'gh' + 'p_' + 'A'.repeat(30),
    'github_' + 'pat_' + 'B'.repeat(40),
    'npm' + '_' + 'C'.repeat(30),
    '-----BEGIN ' + 'PRIVATE KEY-----',
    'https://hooks.' + 'slack.com/services/' + 'SYNTHETIC',
    '//npm.pkg.github.com/' + ':_authToken=synthetic',
  ]) {
    assert.throws(
      () => scanText(unsafe),
      /^Error: (Unsafe public content|Unsafe registry credential)\.$/,
    );
  }
});

test('public scan accepts environment references and synthetic scenario data', () => {
  assert.doesNotThrow(() => scanText('//npm.pkg.github.com/' + ':_authToken=${NODE_AUTH_TOKEN}'));
  assert.doesNotThrow(() => scanText('COMMERCEKIT_SLACK_TEST_WEBHOOK_URL\nsynthetic-build'));
});
