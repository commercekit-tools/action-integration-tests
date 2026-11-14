import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { encodeCcv2PathSegment } from '@commercekit-tools/ccv2-client';
import {
  approvedFixtureBuildCode,
  createApprovedBuildFixture,
  validateApprovedBuildCode,
  verifyApprovalEnvironment,
} from '../scripts/approval.mjs';

const token = 'synthetic_readonly_github_token';
const environmentUrl =
  'https://api.github.com/repos/commercekit-tools/action-integration-tests/environments/sandbox-deploy-approval';
const failure = /^Deployment approval configuration is missing, unavailable or invalid\.$/;

function environment() {
  return {
    name: 'sandbox-deploy-approval',
    can_admins_bypass: false,
    protection_rules: [
      {
        type: 'required_reviewers',
        prevent_self_review: false,
        reviewers: [{ type: 'User', reviewer: { id: 5541121, login: 'anilkreddy' } }],
      },
    ],
    deployment_branch_policy: { protected_branches: false, custom_branch_policies: true },
  };
}

function branches() {
  return { total_count: 1, branch_policies: [{ name: 'main', type: 'branch' }] };
}

function fetchFixture(env = environment(), policies = branches()) {
  const calls = [];
  const fetcher = async (url, init) => {
    calls.push({ url, init });
    const value = calls.length === 1 ? env : policies;
    return Response.json(value);
  };
  return { calls, fetcher };
}

test('approval preflight requires the exact native gate with read-only bounded fixed-origin requests', async () => {
  const { fetcher, calls } = fetchFixture();
  const result = await verifyApprovalEnvironment({ token, fetcher });
  assert.deepEqual(result, {
    environment: 'sandbox-deploy-approval',
    reviewer: 'anilkreddy',
    reviewerId: 5541121,
    branch: 'main',
    administratorBypass: false,
    allowSelfApproval: true,
  });
  assert(!JSON.stringify(result).includes(token));
  assert.deepEqual(
    calls.map(({ url }) => url),
    [environmentUrl, `${environmentUrl}/deployment-branch-policies?per_page=100`],
  );
  for (const { init } of calls) {
    assert.equal(init.method, 'GET');
    assert.equal(init.redirect, 'error');
    assert.equal(init.headers.Authorization, `Bearer ${token}`);
    assert.equal(init.headers.Accept, 'application/vnd.github+json');
    assert.equal(init.body, undefined);
    assert(init.signal instanceof AbortSignal);
    assert.equal(init.signal.aborted, false);
  }
});

test('missing, unprotected, bypassable and mismatched reviewer gates fail before branch reads', async () => {
  const mutations = [
    () => null,
    () => ({}),
    (value) => ({ ...value, name: 'other-environment' }),
    (value) => ({ ...value, can_admins_bypass: true }),
    (value) => {
      delete value.can_admins_bypass;
      return value;
    },
    (value) => ({ ...value, protection_rules: [] }),
    (value) => ({ ...value, protection_rules: {} }),
    (value) => ({ ...value, protection_rules: [null] }),
    (value) => ({
      ...value,
      protection_rules: [...value.protection_rules, ...value.protection_rules],
    }),
    (value) => {
      value.protection_rules[0].prevent_self_review = true;
      return value;
    },
    (value) => {
      delete value.protection_rules[0].prevent_self_review;
      return value;
    },
    (value) => {
      value.protection_rules[0].reviewers = [];
      return value;
    },
    (value) => {
      value.protection_rules[0].reviewers = null;
      return value;
    },
    (value) => {
      value.protection_rules[0].reviewers.push({
        type: 'User',
        reviewer: { id: 1, login: 'other' },
      });
      return value;
    },
    (value) => {
      value.protection_rules[0].reviewers[0].type = 'Team';
      return value;
    },
    (value) => {
      value.protection_rules[0].reviewers[0].reviewer.id = 1;
      return value;
    },
    (value) => {
      value.protection_rules[0].reviewers[0].reviewer.login = 'other';
      return value;
    },
    (value) => {
      value.protection_rules[0].reviewers[0].reviewer = null;
      return value;
    },
    (value) => ({ ...value, deployment_branch_policy: null }),
    (value) => ({
      ...value,
      deployment_branch_policy: { protected_branches: true, custom_branch_policies: false },
    }),
    (value) => ({
      ...value,
      deployment_branch_policy: { protected_branches: false },
    }),
  ];
  for (const mutate of mutations) {
    const { fetcher, calls } = fetchFixture(mutate(environment()));
    await assert.rejects(verifyApprovalEnvironment({ token, fetcher }), { message: failure });
    assert.equal(calls.length, 1);
  }
});

test('branch restrictions require exactly the main branch and cannot admit tags or broad patterns', async () => {
  for (const policies of [
    null,
    {},
    { total_count: 0, branch_policies: [] },
    { total_count: '1', branch_policies: [{ name: 'main', type: 'branch' }] },
    { total_count: 1, branch_policies: [] },
    { total_count: 1, branch_policies: [null] },
    { total_count: 1, branch_policies: [{ name: '*', type: 'branch' }] },
    { total_count: 1, branch_policies: [{ name: 'main', type: 'tag' }] },
    { total_count: 1, branch_policies: [{ name: 'main' }] },
    { total_count: 2, branch_policies: [{ name: 'main', type: 'branch' }] },
    {
      total_count: 1,
      branch_policies: [
        { name: 'main', type: 'branch' },
        { name: 'dev', type: 'branch' },
      ],
    },
  ]) {
    const { fetcher, calls } = fetchFixture(environment(), policies);
    await assert.rejects(verifyApprovalEnvironment({ token, fetcher }), { message: failure });
    assert.equal(calls.length, 2);
  }
});

test('missing and malformed GitHub tokens cause no network request', async () => {
  for (const value of [undefined, null, '', ' ', 'secret\nheader', 'x'.repeat(1001), 123]) {
    let called = false;
    await assert.rejects(
      verifyApprovalEnvironment({
        token: value,
        fetcher: async () => {
          called = true;
          throw new Error('Must not request.');
        },
      }),
      { message: failure },
    );
    assert.equal(called, false);
  }
});

test('permission, malformed, oversized, redirected and lost responses fail without logging secrets', async () => {
  const responses = [
    () => new Response('synthetic_secret_response', { status: 403 }),
    () => new Response('', { status: 404 }),
    () => new Response('', { status: 302 }),
    () => new Response('<html>synthetic_secret_response</html>', { status: 200 }),
    () =>
      new Response('{synthetic_secret_response', {
        headers: { 'Content-Type': 'application/json' },
      }),
    () => Response.json({ ...environment(), extra: 'synthetic_secret_response'.repeat(2000) }),
    () => ({ status: 200, headers: new Headers({ 'Content-Type': 'application/json' }) }),
    () => {
      throw new Error(`Lost response includes ${token} and synthetic_secret_response`);
    },
  ];
  for (const respond of responses)
    for (const failAt of [1, 2]) {
      let calls = 0;
      await assert.rejects(
        verifyApprovalEnvironment({
          token,
          fetcher: async () => (++calls === failAt ? respond() : Response.json(environment())),
        }),
        (error) => {
          assert.match(error.message, failure);
          assert(!String(error).includes(token));
          assert(!String(error).includes('synthetic_secret_response'));
          return true;
        },
      );
      assert.equal(calls, failAt);
    }
});

test('public build handoff accepts only bounded actual Build Action identifiers', () => {
  assert.equal(validateApprovedBuildCode('20261114.1'), '20261114.1');
  const longest = `20261114.${'1'.repeat(55)}`;
  assert.equal(longest.length, 64);
  assert.equal(validateApprovedBuildCode(longest), longest);
  for (const value of [
    undefined,
    null,
    20261114,
    '',
    '20261114',
    '20261114.',
    '.1',
    '../20261114.1',
    '20261114.1\n',
    '20261114.1; echo unsafe',
    '20261114.$(unsafe)',
    '20261114.1/other',
    `20261114.${'1'.repeat(56)}`,
  ]) {
    assert.throws(() => validateApprovedBuildCode(value), /Approved build identifier is invalid/);
    assert.throws(() => approvedFixtureBuildCode(value), /Approved build identifier is invalid/);
    assert.throws(() => createApprovedBuildFixture(value), /Approved build identifier is invalid/);
  }
});

test('approved build recreation uses supported fixture keys and faithful synthetic SAP fields', () => {
  const source = '20261114.1';
  const now = Date.parse('2026-11-14T12:00:00Z');
  const fixture = createApprovedBuildFixture(source, now);
  assert.equal(approvedFixtureBuildCode(source), 'approved-20261114-1');
  assert.deepEqual(fixture, {
    builds: [
      {
        code: 'approved-20261114-1',
        response: {
          code: 'approved-20261114-1',
          subscriptionCode: '131762872233634f29fdeb7d50983aa4',
          applicationCode: 'commerce',
          status: 'SUCCESS',
          buildStartTimestamp: '2026-11-14T11:59:00.000Z',
          buildEndTimestamp: '2026-11-14T12:00:00.000Z',
          deployed: false,
          hasSnapshot: false,
        },
        modifiedAt: '2026-11-14T12:00:00.000Z',
      },
    ],
    deployments: [],
  });
  const longest = approvedFixtureBuildCode(`20261114.${'1'.repeat(55)}`);
  for (const code of [fixture.builds[0].code, longest]) {
    assert.match(code, /^[A-Za-z0-9_-]{1,100}$/);
    assert.equal(encodeCcv2PathSegment(code), code);
  }
  assert(!JSON.stringify(fixture).includes('notification-event'));
  assert(!JSON.stringify(fixture).includes('result-json'));
  const next = createApprovedBuildFixture(source, now);
  fixture.builds[0].response.status = 'FAIL';
  assert.equal(next.builds[0].response.status, 'SUCCESS');
  for (const value of [NaN, Infinity, -1, 0, 60000.5, Number.MAX_SAFE_INTEGER, 'now'])
    assert.throws(() => createApprovedBuildFixture(source, value), /fixture clock is invalid/);
});

test('CommerceKit check targets three actual supported synthetic file types', async () => {
  const directory = new URL('../fixtures/commerce/', import.meta.url);
  const manifest = JSON.parse(await readFile(new URL('manifest.json', directory), 'utf8'));
  assert.deepEqual(manifest, { commerceSuiteVersion: '2211', extensions: [] });
  assert.match(
    await readFile(new URL('languages.impex', directory), 'utf8'),
    /^INSERT_UPDATE Language;isocode\[unique=true\];name\[lang=en\]\n;en;English\n$/,
  );
  assert.equal(
    await readFile(new URL('local.properties', directory), 'utf8'),
    'commercekit.integration.mode=synthetic\n',
  );
});
