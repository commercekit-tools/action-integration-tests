import * as core from '@actions/core';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const environmentName = 'sandbox-deploy-approval';
const environmentUrl =
  'https://api.github.com/repos/commercekit-tools/action-integration-tests/environments/' +
  environmentName;
const errorMessage = 'Deployment approval configuration is missing, unavailable or invalid.';
const maxJsonBytes = 32768;

function requireApproval(condition) {
  if (!condition) throw new Error(errorMessage);
}

/** Public handoff value only; no credentials or arbitrary path/shell fragments. */
export function validateApprovedBuildCode(value) {
  if (typeof value !== 'string' || value.length > 64 || !/^\d{8}\.\d+$/.test(value))
    throw new Error('Approved build identifier is invalid.');
  return value;
}

/** The existing Sandbox fixture keys accept hyphens but not a CCv2 code's dot. */
export function approvedFixtureBuildCode(value) {
  return `approved-${validateApprovedBuildCode(value).replace('.', '-')}`;
}

/** A new synthetic build, not a fabricated Build Action result or notification. */
export function createApprovedBuildFixture(buildCode, now = Date.now()) {
  const code = approvedFixtureBuildCode(buildCode);
  if (!Number.isSafeInteger(now) || now < 60000 || now > 253402300799999)
    throw new Error('Approved build fixture clock is invalid.');
  const completedAt = new Date(now).toISOString();
  return {
    builds: [
      {
        code,
        response: {
          code,
          subscriptionCode: '131762872233634f29fdeb7d50983aa4',
          applicationCode: 'commerce',
          status: 'SUCCESS',
          buildStartTimestamp: new Date(now - 60000).toISOString(),
          buildEndTimestamp: completedAt,
          deployed: false,
          hasSnapshot: false,
        },
        modifiedAt: completedAt,
      },
    ],
    deployments: [],
  };
}

async function readApprovalJson(url, token, fetcher) {
  const response = await fetcher(url, {
    method: 'GET',
    redirect: 'error',
    signal: AbortSignal.timeout(15000),
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'User-Agent': 'CommerceKit-Integration-Tests/1.0',
    },
  });
  requireApproval(response.status === 200);
  requireApproval((response.headers.get('content-type') ?? '').includes('json'));
  const reader = response.body?.getReader();
  requireApproval(reader);
  const chunks = [];
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      requireApproval(bytes <= maxJsonBytes);
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

/** Read-only fail-closed preflight; the native environment remains the actual gate. */
export async function verifyApprovalEnvironment({ token, fetcher = fetch } = {}) {
  try {
    requireApproval(
      typeof token === 'string' && token.length > 0 && token.length <= 1000 && !/\s/.test(token),
    );
    const environment = await readApprovalJson(environmentUrl, token, fetcher);
    requireApproval(environment?.name === environmentName);
    requireApproval(environment.can_admins_bypass === false);
    requireApproval(Array.isArray(environment.protection_rules));
    const reviewerRules = environment.protection_rules.filter(
      (rule) => rule?.type === 'required_reviewers',
    );
    requireApproval(reviewerRules.length === 1);
    const rule = reviewerRules[0];
    requireApproval(rule.prevent_self_review === false);
    requireApproval(Array.isArray(rule.reviewers) && rule.reviewers.length === 1);
    const reviewer = rule.reviewers[0];
    requireApproval(
      reviewer?.type === 'User' &&
        reviewer.reviewer?.id === 5541121 &&
        reviewer.reviewer?.login === 'anilkreddy',
    );
    requireApproval(
      environment.deployment_branch_policy?.protected_branches === false &&
        environment.deployment_branch_policy?.custom_branch_policies === true,
    );
    const branches = await readApprovalJson(
      `${environmentUrl}/deployment-branch-policies?per_page=100`,
      token,
      fetcher,
    );
    requireApproval(branches?.total_count === 1);
    requireApproval(
      Array.isArray(branches.branch_policies) && branches.branch_policies.length === 1,
    );
    requireApproval(
      branches.branch_policies[0]?.name === 'main' &&
        branches.branch_policies[0]?.type === 'branch',
    );
    return Object.freeze({
      environment: environmentName,
      reviewer: 'anilkreddy',
      reviewerId: 5541121,
      branch: 'main',
      administratorBypass: false,
      allowSelfApproval: true,
    });
  } catch {
    throw new Error(errorMessage);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const token = process.env.GITHUB_TOKEN;
  if (typeof token === 'string' && token) core.setSecret(token);
  try {
    requireApproval(process.argv[2] === 'verify-environment');
    await verifyApprovalEnvironment({ token });
    core.info('Required reviewer and main-only deployment approval protection verified.');
  } catch {
    core.setFailed(errorMessage);
  }
}
