# Integration test agent guidance

Read this file and [CONTRIBUTING.md](CONTRIBUTING.md) before changes. Inspect the
current branch/status, manifests, workflows, relevant scripts, and tests first.
Keep changes focused and preserve unrelated work.

- Use Node 24, pnpm 12.6.0, strict code, and existing dependencies.
- Keep domain expectations in the shared scenario catalog and lifecycle/control
  behavior in the shared runner. Do not duplicate complete Actions or shared
  package internals.
- Pin the real Actions to full reviewed commit SHAs in the existing wrappers.
  Package `0.0.3` is not an Action release tag.
- Keep the Sandbox origin fixed to `https://ccv2.sandbox.commercekit.tools`.
  Never introduce real SAP credentials or arbitrary live destinations.
- Store generated run credentials only in private runner-temporary files and
  same-job environment values. Mask them before output; do not forward them as
  job outputs or upload them as artifacts.
- Offline checks must not call live APIs. Live tests remain manual with the
  existing repository/main guards and confirmations. Respect the user's
  explicit authorization for any live run or provider send.
- Preserve always-run cleanup, bounded requests, scenario deadlines, exact
  expected-failure assertions, and shared contract validation.
- Keep tokens read-only. Do not add Marketplace release, tagging, publishing, or
  automatic live-test workflows unless the user explicitly requests that scope.
- Use focused checks during implementation, then the full `pnpm quality` gate,
  final diff review, and `git diff --check` before pushing the final change.

Report actual checks and live-test evidence separately. Do not claim a suite
passed because its workflow exists or offline CI is green. Document any required
manual package access, environment protection, or webhook setup honestly.
