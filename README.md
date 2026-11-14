# CommerceKit Action Integration Tests

Integration coverage for the CommerceKit Build → Deploy → Notify flow against the
public CCv2 Sandbox. This repository executes the actual, SHA-pinned Actions and
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
packages, pinned to `0.0.3`. These package versions are separate from Action
versions. Actual Action pins live once each in the composite wrappers under
`.github/actions/`.

See [Contributing](CONTRIBUTING.md), [agent guidance](AGENTS.md), and the
[security policy](SECURITY.md) before changing the harness.
