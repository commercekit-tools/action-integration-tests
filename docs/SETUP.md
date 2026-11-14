# Setup and manual execution

The live runner targets only `https://ccv2.sandbox.commercekit.tools`. It creates
synthetic, isolated runs and exercises reviewed Build, Deploy, and Notify Action
commits. This setup does not deploy the Sandbox or release any Action.

## Repository configuration

1. Enable GitHub Actions and permit the SHA-pinned checkout/setup-node and
   CommerceKit Actions used by the workflows.
2. Keep `main` as the default branch. Manual integration runs are restricted to
   `commercekit-tools/action-integration-tests` on `refs/heads/main`.
3. Allow the declared `contents: read` and `packages: read` job permissions. The
   workflows need no contents-write, release, or package-publish permission.
4. In each shared package's **Manage Actions access**, grant this repository
   **Read** access to `notification-contract` and `ccv2-client`. Both are pinned
   exactly to `0.0.3`. A successful install with an owner's local credential does
   not prove the repository's workflow token has package access.
5. Create/configure the environments below before the first live dispatch.

The dependency installation step supplies the automatic
`secrets.GITHUB_TOKEN` as `NODE_AUTH_TOKEN`. No custom package token secret is
needed. The source-controlled `.npmrc` contains only the scoped registry mapping;
the setup-node step supplies workflow authentication.

## Environments and secrets

| Environment      | Purpose                                  | Secrets                       |
| ---------------- | ---------------------------------------- | ----------------------------- |
| `sandbox-e2e`    | `smoke` and `full` Sandbox suites        | None                          |
| `provider-smoke` | Deliberate Sandbox → real provider tests | The two webhook secrets below |

Restrict both environments to `main`. Configure required reviewers where desired;
in particular, protect the provider environment before installing its webhook
secrets. Environment protection is an owner setting, not something enforced by
the presence of an environment name in YAML. Check the actual settings before
dispatching.

This repository is public, so environment features are available on the current
GitHub Free plan. Converting it to private can make protections and environment
secrets unavailable on that plan. See
[GitHub environment availability](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments).

| Secret in `provider-smoke`            | Provisioning                                                                      |
| ------------------------------------- | --------------------------------------------------------------------------------- |
| `COMMERCEKIT_SLACK_TEST_WEBHOOK_URL`  | Incoming Webhook for a dedicated Slack test channel                               |
| `COMMERCEKIT_TEAMS_TEST_WORKFLOW_URL` | Teams Workflows webhook posting to a dedicated test channel; configure a co-owner |

Do not use a retired Teams connector setup for the new integration. Keep webhook
URLs out of dispatch inputs, source, screenshots, and logs. Only the selected
provider's URL is passed to Notify. Rotate/delete test destinations when no
longer needed.

There are **no permanent Sandbox or SAP credential secrets**. The runner obtains
`runId`, `controlToken`, `clientId`, `clientSecret`, `resource`, and `tokenUrl`
from a disposable run, masks credential values, and retains them in the same job.
No Cloudflare deployment token, production JWT signing material, or SAP
application repository is required.

## Action and package revisions

The composite wrappers pin these reviewed Action commits:

| Action | Commit                                     |
| ------ | ------------------------------------------ |
| Build  | `923535d589bd8cebece4f3cbf479608f9535c4c3` |
| Deploy | `e2b3f4cb7e03bfbcbba22eaf84545829b5629557` |
| Notify | `8242af6a4aaafd7917c93f0db27f1794266efeee` |

Their committed bundles already include their shared dependencies. Executing a
bundle alone needs no registry authentication. This repository separately
installs the shared packages because its assertion and Management API helpers
reuse them. Package version `0.0.3` is not an Action release tag.

## Dispatch

Use **Actions → Manual Action integration → Run workflow** (`integration.yml`) on
`main`, or use the CLI commands below. The available suites are:

| Suite       | Matrix entries | Provider delivery                      |
| ----------- | -------------: | -------------------------------------- |
| `smoke`     |              2 | Disabled                               |
| `full`      |             16 | Disabled                               |
| `providers` |              8 | Four flows for each of Slack and Teams |

Every live suite requires `RUN-COMMERCEKIT-SANDBOX-TESTS`. The provider suite
additionally requires `SEND-COMMERCEKIT-TEST-NOTIFICATION` and its configured
webhook secret. Wrong confirmations, unsupported scenarios/providers, non-main
refs, and other repositories are rejected before run creation.

```sh
gh workflow run integration.yml \
  --repo commercekit-tools/action-integration-tests --ref main \
  -f suite=smoke \
  -f confirmation=RUN-COMMERCEKIT-SANDBOX-TESTS
```

Run the full Sandbox matrix with `suite=full`. To authorize the deliberate
provider suite:

```sh
gh workflow run integration.yml \
  --repo commercekit-tools/action-integration-tests --ref main \
  -f suite=providers \
  -f confirmation=RUN-COMMERCEKIT-SANDBOX-TESTS \
  -f provider-confirmation=SEND-COMMERCEKIT-TEST-NOTIFICATION
```

These commands are instructions, not evidence of completed live runs. Initial
repository creation and offline CI do not execute these suites. Scheduling and
cross-repository automatic triggering are not configured.

## What each job does

The runner creates one isolated run and configures its scenario before creating
resources. It passes that run's generated OAuth credentials to the actual Build
Action, then passes Build's returned `build-code` to Deploy in the same run. The
test subscription is `131762872233634f29fdeb7d50983aa4`; `commerce` and `d1` are
synthetic application/environment fixtures. Both Actions explicitly target the
Sandbox origin rather than their default SAP URL.

The producer wrappers capture actual Action outcomes and validate their emitted
results/events. A failed producer can be the expected scenario result; blanket
workflow success is never the assertion. The provider suite passes the actual
producer events to Notify with delivery failures configured to fail the test.
See [scenarios](SCENARIOS.md) for expected phases and terminal states.

Each Action uses a ten-second poll interval and one-minute local deadline. Jobs
are bounded to fifteen minutes. The matrix uses at most two parallel jobs and
does not cancel other entries after a failure. Concurrency does not automatically
cancel an already-running suite. The Sandbox limits anonymous run creation to
30 requests per source key per minute; this is not a load-test harness.

Generated credentials remain in private runner-temporary files with mode `0600`
and same-job environment values. They are not job outputs. Masked credentials
cannot reliably be forwarded between jobs; GitHub can omit outputs that may
contain a secret. See
[GitHub output behavior](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idoutputs).

## Cleanup and evidence

Cleanup runs even if setup partially succeeds or an Action, notification, or
assertion fails. It deletes the disposable run with its control token and removes
temporary state. A hard-stopped runner can miss cleanup; runs expire after 24
hours as a fallback. A local Action timeout does not cancel the remote build or
deployment.

Inspect the sanitized job summary for the scenario/provider, validated producer
event count, and assertion result, then inspect the cleanup step's outcome.
Cleanup verifies that reading the deleted run returns 404. Do not upload raw run
files, state, credentials, or provider response bodies. Record the workflow URL,
exact tested Action SHAs, and final suite result when maintaining integration evidence.
Successful Notify delivery means the provider accepted the webhook; inspect
representative Slack and Teams messages on desktop/mobile to verify the visual
result as well.

Failure diagnosis starts with the relevant stage: package installation/access,
preflight/creation, producer result, event validation, notification delivery,
state assertion, or cleanup. Provider permission/webhook errors are independent
of successful Sandbox builds and deployments. Preserve logs only in their
sanitized form.

## Local development

Use Node 24 and pnpm 12.6.0. Configure a classic GitHub personal access token with
`read:packages` in user-level or ephemeral npm authentication outside this
repository, with organization SSO authorization when required. Never store it in
source or a repository secret. `npm config get userconfig` identifies the selected
user configuration; do not print authentication settings.

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm quality
git diff --check
```

The quality gate is offline with respect to Sandbox and notification providers;
dependency installation/audit can contact package registries. Do not run the
live runner from a local shell by weakening its GitHub repository/event/ref
guards. Use a deliberate manual workflow dispatch after setup.

## Release hold

This repository has no Marketplace, Action-tagging, GitHub Release, or package
publication workflow. Its token permissions are read-only. Passing tests here
does not release Notify, Build, or Deploy; release remains a separate decision in
their owning repositories.
