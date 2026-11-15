# CommerceKit Action Integration Tests

Integration coverage for the CommerceKit Build → Deploy → Notify flow against the
public CCv2 Sandbox, including an approval-gated synthetic deploy and cleanup dry-run. This repository executes the actual, SHA-pinned Actions and
uses their real outputs; it does not replace them with test implementations.

Each scenario creates one disposable Sandbox run, runs the Build Action, passes
its returned build code to Deploy, validates results and NotificationEvent v1
events, and attempts cleanup even after failure. The provider suite also delivers
those events through Notify to dedicated Slack and Teams test destinations.

| Suite       | Coverage                                                               | External effects                                           |
| ----------- | ---------------------------------------------------------------------- | ---------------------------------------------------------- |
| `smoke`     | Rolling success and separate green ACCEPT handoff                      | Two disposable Sandbox runs; no provider messages          |
| `full`      | All 16 build, deployment, decision, resume, and cancellation scenarios | Disposable Sandbox runs; no provider messages              |
| `providers` | Four representative flows through each of Slack and Teams              | Eight disposable Sandbox runs and deliberate test messages |

Ordinary pull-request and `main` CI run offline validation only. Live suites are
manual, restricted to this repository's `main`, and require exact confirmation
strings. They never use real SAP credentials. Marketplace publication, Action
release tags, and package publishing are intentionally absent.

Start with [setup and dispatch](docs/SETUP.md). The [scenario reference](docs/SCENARIOS.md)
defines expected negative outcomes and required assertions. Passing offline CI is
not evidence that live Sandbox scenarios or provider delivery have passed.

## Additional manual workflows

| Workflow                                                               | Order and effect                                                                                                                                                                                 |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [build-approve-deploy.yml](.github/workflows/build-approve-deploy.yml) | Repository quality gate → CommerceKit check of three synthetic files → actual CCv2 Build Action → required approval → recreate the validated build in a fresh Sandbox run → actual Deploy Action |
| [cleanup.yml](.github/workflows/cleanup.yml)                           | Create an isolated 105-build fixture → actual Cleanup Action in hardcoded dry-run → repeat and compare → verify zero target mutations → remove the run                                           |

Both require a deliberate main-branch dispatch and
`RUN-COMMERCEKIT-SANDBOX-TESTS`. They have no schedule, real SAP credentials,
provider sends, publication or release steps. The approval environment is
`sandbox-deploy-approval`: reviewer `anilkreddy`, own-run approval allowed, main
only, administrator bypass disabled. Its settings are verified before the build
and again before preparing the approved deployment run.

The repository stage runs this JavaScript harness's existing `pnpm quality` gate;
it does not compile a customer Commerce application. CommerceKit CLI
`0.1.0-preview.2` checks real supported fixture files. Only a validated build code
crosses jobs; source-run credentials are never exported or uploaded. Approval
starts a fresh synthetic run, with the source code mapped to an `approved-...`
fixture identifier because the Sandbox fixture API does not accept dots in keys.

See [workflow setup, dispatch and limits](docs/WORKFLOWS.md). In particular,
merged Sandbox source does not prove that the hosted `/cleanup-fixture` endpoint
is deployed. Live workflow results are recorded separately from offline tests.

## Consistent reporting candidate validation

An opt-in [local candidate harness](docs/REPORTING-CANDIDATES.md) validates the
five actual bundled Actions against an exact reviewed shared-contract tarball.
It runs the existing synthetic scenarios in the local Sandbox, mocks provider
fetches, and checks input coverage, secret masking, status icons/tables and
notification/summary parity. It never dispatches hosted workflows or sends live
provider messages. Normal CI and the SHA-pinned hosted workflows remain unchanged;
unpublished source-candidate success is not registry or release readiness.

## Development

Use Node 24 and pnpm 12.6.0, then configure local GitHub Packages read access as
described in [setup](docs/SETUP.md#local-development).

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm quality
```

Shared schema validation and CCv2 HTTP/authentication come from the existing
`@commercekit-tools/notification-contract` and `@commercekit-tools/ccv2-client`
packages, pinned to `0.0.4` and `0.0.3` respectively. These package versions are separate from Action
versions. Action revisions are catalogued in `action-refs.json`. Producer pins live in
the composite wrappers under `.github/actions/`; CLI setup is pinned in the
build/approval workflow.

See [Contributing](CONTRIBUTING.md), [agent guidance](AGENTS.md), and the
[security policy](SECURITY.md) before changing the harness.
