# Workflow implementation validation — 2026-11-14

This record distinguishes offline/local validation from hosted manual workflow
execution. No hosted Sandbox run, provider send, real SAP operation, release,
tag, package publication or Sandbox Worker deployment was performed.

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

| Command/check                                                 | Status                      | Evidence                                                                                                             |
| ------------------------------------------------------------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Baseline `pnpm install --frozen-lockfile` and `pnpm quality`  | PASS                        | 33 pre-change offline tests, all existing checks and audit passed                                                    |
| Registry query for `notification-contract@0.0.4`              | PASS                        | Exact published version/integrity verified with authorized read access                                               |
| Updated `pnpm install --frozen-lockfile`                      | PASS                        | Registry-only reproducible lockfile, no local links or fake versions                                                 |
| Updated `pnpm quality`                                        | PASS                        | Formatting, ESLint, 62 offline tests, workflow policy, public scan and dependency audit                              |
| `actionlint .github/workflows/*.yml`                          | PASS                        | Existing and new workflows linted with actionlint 1.7.12                                                             |
| `git diff --check`                                            | PASS                        | No whitespace errors                                                                                                 |
| Published CLI check of actual fixture files                   | PASS                        | CLI 0.1.0-preview.2; three supported files, zero findings                                                            |
| Actual Cleanup bundle against local Sandbox                   | PASS                        | Exact consumer fixture and actual assertion function, two runs, matching decisions/counts, zero target mutations     |
| Actual Deploy bundle against local Sandbox                    | PASS                        | Recreated mapped build fixture, successful actual result/event, one scoped deployment creation, zero Build API calls |
| Configured environment read-back                              | PASS                        | Required reviewer/main-only/no-bypass settings verified independently                                                |
| Hosted ordinary PR CI on the final feature head               | NOT RUN at report recording | Must be inspected after pushing; PR checks carry current hosted evidence                                             |
| Hosted manual build/check/approval/deploy or cleanup workflow | NOT RUN                     | No dispatch or hosted Sandbox fixture operations authorized/performed                                                |

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

The manual workflow's Ubuntu setup/check execution remains NOT RUN. Availability
of its release assets and passing setup-Action checks do not substitute for that
workflow's execution.

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

A read-only GET of the public hosted `/openapi/sandbox.json` advertises
`/sandbox/v1/runs/{runId}/cleanup-fixture` (OpenAPI 3.1.0/version 1.0.0). No hosted
run was created to execute that handler. The web reader initially could not open
this metadata URL; a bounded HTTPS curl read succeeded. Actual hosted fixture
behavior, job-token package/API access, Linux CLI execution, native approval,
new hosted flow assertions and final hosted run cleanup remain **NOT RUN** until
an explicitly authorized main-branch manual dispatch after review/merge.

No real SAP credentials are needed or permitted in these workflows. The cleanup
Action's unresolved production eligibility/operational evidence and owner release
approval gates remain unchanged. No automatic schedule, deletion-enable variable,
force-delete option or credential/artifact handoff was introduced.
