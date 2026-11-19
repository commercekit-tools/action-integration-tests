# Contributing

Use Node 24 and pnpm 12.6.0. Install dependencies with
`pnpm install --frozen-lockfile`, using GitHub Packages credentials held outside
the repository. Follow [setup](docs/SETUP.md#local-development).

Work on a focused branch, keep scenarios synthetic, and add meaningful offline
regression coverage when behavior changes. Run the complete `pnpm quality` gate
after the final change and before pushing. Inspect the final diff and run
`git diff --check`. Do not commit generated credentials, local authentication,
temporary run files, provider payloads, or raw Sandbox state.

Keep one scenario catalog and one shared run controller. Reuse the published
contract validator and CCv2 client instead of copying schema, token, retry, or
transport implementations. Update the `action-refs.json` catalog, existing workflow/composite
pins and `action-inputs.json` metadata together; the offline policy checks their agreement.
Current setup guides link to that catalog, while dated validation reports retain the
revisions they actually tested. Rerun the required integration suites with separate live-run
authorization before claiming new revisions verified.

Offline tests must inject network behavior and must not create Sandbox runs or
send webhook requests. Live suites use the manual `integration.yml` workflow,
fixed Sandbox origin, exact confirmations, and configured environments. Follow
the existing authorization for the requested task; do not dispatch provider
sends merely to validate a documentation or offline implementation change.

Expected Action failures are test data, not blanket permission to ignore errors.
The harness must verify the actual step outcome, result, event, request counters,
and cleanup. Keep cleanup reachable after preparation, producer, notification,
or assertion failures. Avoid automatic cancellation of active test runs.

The repository tests Actions; it does not release them. Do not add Marketplace,
tagging, GitHub Release, package publication, or automatic live-test triggers as
incidental changes. Merging test changes does not authorize an Action release.
