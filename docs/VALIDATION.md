# Workflow validation — updated 2026-11-15 (UTC)

## Published 0.0.6 registry transition

The authorized package-only [run 43678067818](https://github.com/commercekit-tools/action-kit/actions/runs/43678067818)
published notification-contract 0.0.6 from main
`3fecce40414d709884fa48e48eca278f470b20b0`. This harness now installs exact
registry 0.0.6 with client 0.0.3 unchanged. Frozen installation, independent
registry tarball SHA256/SRI/byte proof and the complete ordinary `pnpm quality`
passed: **76 offline tests, zero skips**, format/lint, unchanged workflow policy,
public scan and audit with no known vulnerabilities.

The local reporting command now requires normal registry manifests/locks and
installed public package bytes; candidate-only overrides were retired. An early combined five normal registry bundle replay passed all 24 records on
clean reviewed branch heads. The first attempt exposed pnpm 12 multi-document
lock parsing before any target call; strict graph selection and a dedicated
regression test resolved it. Final reviewed merged Action pins passed a new
24-record replay in **55,745 ms** from clean committed harness
`a4224df787c277b88deb1458eaa9162e6838967c`; every source was clean and matched
the adopted immutable ref. Four disposable runs were removed with absence
verified, both Cleanup passes made zero target mutations, Setup invalid input
made zero network calls, and all 16 provider requests were mocked. See
[final safe evidence](reporting-registry-main-evidence.json) and
[current reporting evidence](REPORTING.md); prior
source-candidate evidence remains [historical](REPORTING-CANDIDATES.md). New
hosted dispatches and live provider/SAP validation have not run.

The final Build/Deploy pins include narrow test-only CodeQL corrections. Their
initial green jobs had two/three processed findings; final exact-main analyses
now contain zero results and zero open alerts. All six repositories have green
main validation/CodeQL and clear processed analyses. The combined report also
records Setup's existing OrganizationAdmin merge exception, without suggesting
that review was fabricated or protection changed.

## Historical 0.0.4 baseline and hosted workflow evidence

The remaining sections record earlier published 0.0.4 Action pins and their
executed workflows. Their legacy failure-status cleanup event assertions do
not describe the new 0.0.6 warning vocabulary or establish a new hosted run.

This record distinguishes offline/local validation from owner-authorized hosted
Sandbox execution. Both new manual workflows completed successfully after PR #1
merged. No provider send, real SAP operation, release, tag, package publication or
Sandbox Worker deployment was performed.

## Hosted manual workflow results — 2026-11-15 UTC

**PASS:** both workflows were dispatched once from main at exact merge commit
`529d1bc46dbe33f7f99571e737744930e8fc67e9`, after
[PR #1](https://github.com/commercekit-tools/action-integration-tests/pull/1)
merged at **01:22:04 UTC**. Both report `event=workflow_dispatch`, the same
`headSha`, and completed/success:

| Workflow                                                          | Hosted run                                                                                            | Result |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------ |
| Build → check → cloud build → approval → recreated Sandbox deploy | [43662830371](https://github.com/commercekit-tools/action-integration-tests/actions/runs/43662830371) | PASS   |
| Cleanup dry-run, first and repeat                                 | [43662832630](https://github.com/commercekit-tools/action-integration-tests/actions/runs/43662832630) | PASS   |

### Approval and actual deployment evidence

| Job                | Job ID         | Completion (UTC) | Verified behavior                                                                                                                  |
| ------------------ | -------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `repository-build` | `132655674053` | 01:23:14         | Frozen install, 62 offline tests/audit, read-only environment preflight passed                                                     |
| `commerce-check`   | `132655744576` | 01:23:24         | Ubuntu setup of exact CLI 0.1.0-preview.2 and actual fixture check passed                                                          |
| `cloud-build`      | `132655783401` | 01:23:55         | Actual Build result/event, public identifier handoff and source-run removal passed                                                 |
| `deploy`           | `132655904047` | 01:26:26         | Post-approval protection recheck, fresh synthetic fixture, actual Deploy result/event/detail and scoped mutation assertions passed |

The workflow was observed waiting at `sandbox-deploy-approval` after the cloud
build. GitHub's review-history API records **approved** by **anilkreddy** for that
environment (ID 27316488044). The deploy job started at **01:26:00 UTC**, after the
owner approved through GitHub. No approval API write or administrator bypass was
used by the agent. Both environment preflights succeeded using the workflow's
read-only token. Native approval and the new jobs' package/metadata access are
now verified rather than pending setup.

The source build `20261115.1` completed with status SUCCESS. Its recreated fixture
`approved-20261115-1` deployed as `700001` with status DEPLOYED.
Only the validated public source build code crossed jobs. The original run was
removed before the approval wait. After approval, the runner created a different
isolated run and a mapped `approved-...` fixture; it did not preserve the original
resource or fabricate a Build Action event. The actual pinned Deploy Action and
its emitted event passed validation. Final assertions checked the server's
DEPLOYED result, matching fixture identity, exactly one `createDeployment:d1`,
no other deployment creation and zero Build creation API calls in the approved run.

### Cleanup dry-run evidence

Job `132655681208` completed successfully at **01:23:23 UTC**. Both actual Cleanup
Action invocations passed the shared result/event validator with identical
per-build decisions and counts:

| Count/disposition                     | Each invocation |
| ------------------------------------- | --------------: |
| Scanned / skipped                     |       105 / 105 |
| Protected dispositions                |              13 |
| Eligible / planned / deferred         |       0 / 0 / 0 |
| Deletion requested / failed / unknown |       0 / 0 / 0 |
| Target API mutations                  |               0 |

Both results were `blocked` with `dryRun=true`, inventory completeness true and
protection/eligibility completeness false, matching the current production
eligibility gate. Both actual events were `ccv2.build-cleanup.completed`, shared
status=failure, mode=dry-run and deletionRequestedCount=0. A blocked dry-run is a
handled successful Action execution in this fixture; the harness checked that
specific expected outcome rather than ignoring errors. The final assertion
verified both pages/passes, matching repeat decisions and read-only target
counters. No build DELETE was attempted. Fixture/control operations are counted
separately from target API mutations.

### Removal of all disposable Sandbox runs

All three final cleanup steps succeeded, and their logs explicitly confirm
"Disposable Sandbox run deleted and absence verified." The shared controller
requires control-plane DELETE 204 followed by GET 404 before printing that line:

| Disposable run                    | Cleanup confirmation (UTC) |
| --------------------------------- | -------------------------- |
| Source cloud-build run            | 01:23:53.800               |
| Approved recreated deployment run | 01:26:25.200               |
| 105-build cleanup fixture run     | 01:23:20.092               |

This verifies absence immediately after removal through the runner's authenticated
follow-up read. No control/OAuth credentials, private run files or raw response
bodies were recovered or committed for an extra outside-run probe.

Evidence was independently checked from `gh run view` metadata/logs for both run
IDs and the read-only `actions/runs/43662830371/approvals` API. Logs and existing
controller assertions establish the results; no workflow was retried or dispatched
again while monitoring. These two hosted paths now pass. The original live
smoke/full/provider suites, live Slack/Teams delivery and real SAP validation are
not claimed by this result. Real cleanup apply remains blocked by the unresolved
SAP eligibility/operational evidence and separate owner approvals.

## Source and dependencies

- Integration repository base: `a7c06fceadfd50d4f74c15b1d568b9c39b093f91`.
- Existing Build, Deploy, Notify and third-party Action pins are preserved.
  Added setup-commercekit `7f650f3162ab027bfd784cf879832f44d3248584` and
  cleanup `4ab51d33ded51a360e8223e686bb46918cf7863f`. Full pins live in
  [action-refs.json](../action-refs.json) and are enforced by policy tests.
- Existing `@commercekit-tools/ccv2-client@0.0.3` still owns OAuth and Management
  API transport. The actual published `notification-contract@0.0.4` owns shared
  cleanup event creation/validation; the registry lockfile was regenerated.
- Contract registry integrity:
  `sha512-y1kTB/s049V0DGLoQZd4s+vlFscShG5wS5g2H4WH6t6rRSOuJrKiCy42dcNlx5wC7NAy6hQuYoTFOQVQ1+PVoA==`.
- Node 24.21.0 and pnpm 12.6.0; existing dependencies/test stack retained. No copied
  Action, OAuth, generic transport, notification schema or provider delivery.

## Executed checks

| Command/check                                                   | Status | Evidence                                                                                                                                                                                                     |
| --------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Baseline `pnpm install --frozen-lockfile` and `pnpm quality`    | PASS   | 33 pre-change offline tests, all existing checks and audit passed                                                                                                                                            |
| Registry query for `notification-contract@0.0.4`                | PASS   | Exact published version/integrity verified with authorized read access                                                                                                                                       |
| Updated `pnpm install --frozen-lockfile`                        | PASS   | Registry-only reproducible lockfile, no local links or fake versions                                                                                                                                         |
| Updated `pnpm quality`                                          | PASS   | Formatting, ESLint, 62 offline tests, workflow policy, public scan and dependency audit                                                                                                                      |
| `actionlint .github/workflows/*.yml`                            | PASS   | Existing and new workflows linted with actionlint 1.7.12                                                                                                                                                     |
| `git diff --check`                                              | PASS   | No whitespace errors                                                                                                                                                                                         |
| Published CLI check of actual fixture files                     | PASS   | CLI 0.1.0-preview.2; three supported files, zero findings                                                                                                                                                    |
| Actual Cleanup bundle against local Sandbox                     | PASS   | Exact consumer fixture and actual assertion function, two runs, matching decisions/counts, zero target mutations                                                                                             |
| Actual Deploy bundle against local Sandbox                      | PASS   | Recreated mapped build fixture, successful actual result/event, one scoped deployment creation, zero Build creation API calls                                                                                |
| Configured environment read-back                                | PASS   | Required reviewer/main-only/no-bypass settings verified independently                                                                                                                                        |
| Hosted ordinary PR CI on the implementation head                | PASS   | [Run 43632346842](https://github.com/commercekit-tools/action-integration-tests/actions/runs/43632346842) on `2563fd12ad4d8588a002a7e3dd0f8ee22b69cffd`; 62 tests, frozen job-token install and audit passed |
| Hosted manual build/check/approval/deploy and cleanup workflows | PASS   | Runs 43662830371 and 43662832630 on merged main 529d1bc; native approval, actual outputs/events and all disposable-run removals verified above                                                               |

Final offline suite: **62 passed, zero failed/cancelled/skipped**. All existing
16 scenario definitions and smoke/full/provider matrices remain unchanged.
New tests cover native-gate configuration failures, branch/tag restrictions,
read-only fixed GitHub API calls and bounds, CLI fixtures, public-only build
handoff, fresh credentials/private files, forbidden producer fabrication,
mismatched results/state, scoped mutation counters, partial preparation/final
cleanup, 105-build retention reasons, repeated decisions, valid shared events,
zero target mutations and malicious workflow policy changes.

During dependency replacement, pnpm initially rejected the old 0.0.3 lock entry
after its exact age exception was removed. Regeneration temporarily retained the
already-reviewed old exception; the final manifest/lockfile and age exceptions
contain only client 0.0.3 and contract 0.0.4. Final frozen verification passed.
No release-age policy, audit level or existing test expectation was weakened.

## Actual CLI evidence

The public immutable release `cli-v0.1.0-preview.2` was inspected. Its native
Darwin ARM64 archive was downloaded to a private temporary directory and verified
against the GitHub asset digest, published SHA256SUMS and release manifest before
execution. No global installation was made.

- Release build ID: `bceb04d3246ba74ce96bae27f5407862a11e04eb`.
- Archive size: 32126202 bytes; SHA256:
  `264c476c3a6ae0174ec2659f1e1c90b30b0942b78ae2a1e2e970465ec0b1c6eb`.
- Extracted binary SHA256:
  `2e955ba4b800a21cc910669dd7485b87371f98b03f78176b3ee1f5001ce037ea`.
- `commercekit --version` returned 0.1.0-preview.2.
- `commercekit check fixtures/commerce --format github` exited 0 with no findings.
- `commercekit check fixtures/commerce --json` returned success with three files:
  one each for ImpEx, Properties and Manifest; zero errors/warnings/infos.

**PASS:** the manual workflow's Ubuntu setup/check execution is now verified by
job `132655744576` in hosted run 43662830371. This is additional to the earlier
native Darwin validation and confirms execution of the exact pinned setup Action
and CLI against the committed fixtures.

## Actual local bundle evidence

Temporary scripts were run with Node 24 first on PATH:

```sh
node /private/tmp/consumer-local-fixture-check.mjs
node /private/tmp/consumer-approved-deploy-fixture-check.mjs
```

They started isolated local HTTPS Sandbox workers from the existing reviewed
checkout equivalent to merged Sandbox `4af998a4783ffa54dd5d7835bfc0dcc4dd382e14`.
The cleanup script imported the exact `getCleanupFixture` and `assertCleanupRecord`
from this repository and executed the real normal bundle twice. All expected
105-build counts/reason sets and actual 0.0.4 events passed; listing counters
proved multiple pages/passes and zero target mutations. Repeat decisions matched.

The Deploy script used the exact existing pinned Deploy bundle with the mapped
`approved-...` fixture. Actual output/event validation passed, observing one
`createDeployment:d1`, no `createBuild` call, and successful server detail.
This exposed an initial fixture/assertion mismatch using an empty counter key.
The controller and existing ambiguous-create assertion now use the actual scoped
counter contract; regressions reject wrong/extra scopes, invalid counts and
aggregate overflow. This was a real contract correction, not relaxed validation.

Bundle SHA256:

- Cleanup: `be0faed210885aad0eabacf2525befd32c5fa6b378d4cd9825f35506c214c4b4`.
- Deploy: `dc9c95ff34749d0fd9c475702b820f608a6f60fef1cf97dde0ee85ae401405ba`.

Both scripts removed their runs in finally blocks (DELETE 204 then GET 404) and
stopped local workers. These temporary scripts are local validation evidence,
not permanent CI entry points. Production workflow destinations remain fixed to
the hosted Sandbox; no arbitrary destination input was added.

## Environment and remaining gates

The owner selected the `sandbox-deploy-approval` environment settings. Separate
API read-backs confirmed required User reviewer `anilkreddy`/5541121,
prevent_self_review=false, can_admins_bypass=false, and exactly one `main` branch
policy, with no tag or wildcard rule. No permanent secrets were added. The native
gate and the two read-only configuration preflights are documented in
[WORKFLOWS.md](WORKFLOWS.md).

The initial read-only hosted OpenAPI inspection advertised
`/sandbox/v1/runs/{runId}/cleanup-fixture`. The authorized hosted workflows now
executed that handler successfully for the cleanup fixture and approved-build
recreation. Repository/job-token frozen installs, environment metadata reads,
Linux CLI checking, native human approval, actual Action assertions and final
hosted run removal are **PASS** as recorded above.

**NOT RUN:** the original hosted smoke/full/provider suites and actual
Slack/Teams sends; dedicated hosted cancellation/network-timeout fixture tests;
all real SAP read/dry-run/destructive validation. These results do not establish
production SAP eligibility enforcement. No additional deployment or publication
was performed to validate the report update.

No real SAP credentials are needed or permitted in these workflows. The cleanup
Action's unresolved production eligibility/operational evidence and owner release
approval gates remain unchanged. No automatic schedule, deletion-enable variable,
force-delete option or credential/artifact handoff was introduced.
