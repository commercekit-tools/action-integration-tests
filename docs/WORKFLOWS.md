# Manual build approval and cleanup workflows

These workflows exercise SHA-pinned CommerceKit Actions against the fixed
`https://ccv2.sandbox.commercekit.tools` origin. They never target SAP and do not
publish packages, tag releases, deploy the Sandbox Worker or enable real deletion.
Both run only after a deliberate `workflow_dispatch` on this repository's main
branch with exact confirmation `RUN-COMMERCEKIT-SANDBOX-TESTS`.

## Build → check → cloud build → approval → synthetic deploy

`build-approve-deploy.yml` has four ordered jobs:

1. `repository-build`: install frozen dependencies and run the existing offline
   `pnpm quality` gate. This JavaScript integration harness has no application
   compiler or customer source. Verify the configured approval environment using
   read-only GitHub API calls before creating any Sandbox run.
2. `commerce-check`: install the exact published CommerceKit CLI
   `0.1.0-preview.2` with the pinned setup Action, then run
   `commercekit check fixtures/commerce --format github`. Three committed files
   exercise Manifest, Properties and ImpEx checking; an empty directory is not
   used as evidence of validation.
3. `cloud-build`: create a disposable isolated run, execute the actual Build
   Action, validate its returned result/event and successful build code, then
   export only that public identifier. Always remove and verify absence of the
   source run. Cleanup failure prevents the dependent deploy job.
4. `deploy`: wait for native GitHub environment approval. After approval, recheck
   environment protections, create a fresh isolated run, and seed a new completed
   build fixture from the validated public source identifier. Run the actual
   Deploy Action with `d1`, `ROLLING_UPDATE`, and database mode `NONE`; validate
   its real result/event plus server detail and observed mutation counts. Always
   remove this run and verify absence.

This is explicitly a **recreated synthetic build handoff**, selected by the
owner. It does not preserve or deploy the original resource/run. The supported
Sandbox fixture API disallows dots in fixture keys, so `20261114.1` becomes
`approved-20261114-1`. The summary shows both identities. No Build Action result
or notification is fabricated for the recreated fixture. No generated control
or OAuth credential, raw run file, or private path crosses jobs or becomes an
artifact. Each Sandbox job obtains and masks fresh credentials in private runner-temp
files (`0600`, directory `0700`).

### Configured approval environment

On 2026-11-14 the owner selected and the API read-back verified:

| Setting                | Value                                          |
| ---------------------- | ---------------------------------------------- |
| Environment            | `sandbox-deploy-approval`                      |
| Required reviewer      | `anilkreddy`, user ID 5541121                  |
| Own-run approval       | Allowed (`prevent_self_review=false`)          |
| Administrator bypass   | Disabled (`can_admins_bypass=false`)           |
| Allowed deployment ref | Exact `main` branch; no tag or wildcard policy |
| Permanent secrets      | None                                           |

The helper fails closed if the environment is missing, unavailable, has a wrong
reviewer/ref, permits administrator bypass, or returns malformed/oversized data.
The native environment remains the actual approval gate; YAML naming alone does
not configure protection. `actions: read` is granted only to the two jobs that
read environment metadata. All other permissions remain `contents: read` and
`packages: read`; no workflow token receives write access.

Inspect the live settings if they change:

```sh
gh api repos/commercekit-tools/action-integration-tests/environments/sandbox-deploy-approval
gh api repos/commercekit-tools/action-integration-tests/environments/sandbox-deploy-approval/deployment-branch-policies
```

After this workflow is reviewed and merged, dispatch deliberately:

```sh
gh workflow run build-approve-deploy.yml \
  --repo commercekit-tools/action-integration-tests --ref main \
  -f confirmation=RUN-COMMERCEKIT-SANDBOX-TESTS
```

Wait for the build result, open the run, select **Review deployments**, and approve
`sandbox-deploy-approval`. Rejecting or leaving it unapproved prevents the deploy
job from starting. The source run has already been cleaned before the wait. Job
execution timeouts are 5–10 minutes; GitHub's environment wait is separate. The
workflow uses repository-local concurrency without automatically cancelling an
active run. It is not a distributed lock or a production deployment workflow.

## Cleanup dry-run

`cleanup.yml` creates one isolated 105-build fixture using the existing shared
runner and catalog, then executes the actual pinned Cleanup Action twice. Inputs
are fixed to subscription `131762872233634f29fdeb7d50983aa4`, application `commerce`,
retention 30 days, keep-latest 10, cap 20, exclusion `cleanup-006`, timeout 2 minutes,
continue-on-delete-error=false, and **dry-run=true**. There is no apply input or
schedule. `sandbox-e2e` main-only protection remains in use.

The expected production-shaped result is blocked because eligibility evidence is
unverified. Assertions require exact counts/reasons, valid contract 0.0.6 cleanup
events, matching repeat-run decisions and zero target API mutations. They also
check listing counters to establish multi-page discovery. Fixture/control-plane
operations do not count as target DELETE requests. The run is removed in an
always-run final step, including partial preparation and assertion failures.

After review/merge and hosted fixture capability verification:

```sh
gh workflow run cleanup.yml \
  --repo commercekit-tools/action-integration-tests --ref main \
  -f confirmation=RUN-COMMERCEKIT-SANDBOX-TESTS
```

No SAP secrets, webhook credentials, Cloudflare credentials, subscription
variables or deletion-enable variables are needed for these Sandbox workflows.
Do not add production credentials to this public test repository.

## Validation and remaining setup

Offline CI injects network behavior and never creates hosted Sandbox runs or
sends notifications. It verifies the ordered jobs, native gate and preflights,
read-only permissions, exact Action/CLI pins, fixed origin, private lifecycle,
credential-free handoff, actual shared event validation and zero-mutation cleanup
assertions. See [VALIDATION.md](VALIDATION.md) for commands actually run.

The hosted Sandbox must support `PUT /sandbox/v1/runs/{id}/cleanup-fixture`, which
is present in the reviewed merged Sandbox source. A read-only check of the hosted public control OpenAPI also advertises this
operation. That metadata read does not execute the fixture handler, and the
Sandbox Worker was not deployed by this task. Hosted capability and end-to-end workflow execution are separate
validation gates. Until a deliberately authorized run succeeds, do not claim
that the hosted approval/deploy or cleanup integrations have passed. The first
manual runs should be inspected for package-read access, fixture API support,
actual approval behavior, Action assertions and successful final run removal.

The original Build/Deploy/Notify suites remain available through `integration.yml`.
Live provider messages still require their separate confirmation and webhook
setup; these two new workflows send no provider messages. Hard runner termination
can prevent final cleanup; the Sandbox's 24-hour expiry remains a fallback. None
of this clears the cleanup Action's real-SAP eligibility/release gates.
