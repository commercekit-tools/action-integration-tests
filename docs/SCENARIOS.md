# Scenario reference

Every matrix entry has its own disposable Sandbox run. Build and Deploy within
that entry share the same generated OAuth credentials and run state. The actual
Build Action supplies Deploy's build code; preparation never fabricates a
successful prerequisite build.

`smoke` runs `rolling-success` and `green-accept`. `full` runs all scenarios below
with provider delivery disabled. `providers` runs `rolling-success`,
`build-failure`, `rolling-failure`, and `green-manual` once for `slack` and once
for `teams-workflow`, delivering each phase's actual producer event.

## Build and rolling deployment

| Scenario              | Build expectation                                              | Deployment expectation                                              |
| --------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------- |
| `rolling-success`     | `SUCCESS` / success                                            | `DEPLOYED` / success                                                |
| `build-failure`       | `FAIL` / failure                                               | Skipped                                                             |
| `build-timeout`       | Nonterminating `BUILDING`; `BUILD_WAIT_TIMEOUT`                | Skipped                                                             |
| `build-rate-limit`    | First progress call returns 429; retries to success            | Rolling success                                                     |
| `build-create-error`  | Create returns 500; `CREATE_BUILD_AMBIGUOUS`; no create replay | Skipped                                                             |
| `rolling-failure`     | Success                                                        | `FAIL` / failure                                                    |
| `deploy-timeout`      | Success                                                        | Nonterminating `DEPLOYING`; `DEPLOYMENT_WAIT_TIMEOUT`               |
| `deploy-rate-limit`   | Success                                                        | First progress call returns 429; retries to success                 |
| `deploy-create-error` | Success                                                        | Create returns 500; `CREATE_DEPLOYMENT_AMBIGUOUS`; no create replay |

A timeout is an internal-error outcome with `timedOut: true`; it does not invent
a vendor `TIMEOUT` state or cancel the remote operation. A 429 fault uses a
bounded `Retry-After` and must produce retry/progress-count evidence. An injected
create error must leave zero resources of that kind and exactly one create
attempt in the Sandbox counters.

## Green decisions, resume, and cancellation

All these scenarios first build successfully through the actual Build Action.

| Scenario               | Initial Deploy                                              | Follow-up operation                                                            | Final operation                                             |
| ---------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| `green-manual`         | GREEN with MANUAL decision; action required                 | None                                                                           | None                                                        |
| `green-accept`         | GREEN/MANUAL handoff                                        | Separate `decide: ACCEPT`; success                                             | None                                                        |
| `green-prepare-canary` | GREEN/MANUAL handoff                                        | Separate `decide: PREPARE_CANARY` with 10% `commerce` traffic; action required | `decide: ACCEPT` using the current returned deployment code |
| `green-reject`         | GREEN/MANUAL handoff                                        | Separate `decide: REJECT`; cancelled / `UNDEPLOYED`                            | None                                                        |
| `cancel`               | Nonterminating rolling deployment reaches its local timeout | Separate `cancel`; cancelled / `UNDEPLOYED`                                    | None                                                        |
| `resume`               | GREEN/MANUAL handoff                                        | Separate `resume`; still action required                                       | Separate `decide: ACCEPT`; success                          |
| `green-inline-accept`  | GREEN with automatic ACCEPT; success                        | None                                                                           | None                                                        |

Manual and canary handoffs are successful Action steps with
`action-required: true`; they are not terminal deployment success. Cancellation
and REJECT deliberately produce a failed Action step because the operation's
outcome is cancelled. The wrapper verifies those expected failures.

Canary preparation may return a new deployment code. Subsequent operations must
use the latest `deployment-code`, not `original-deployment-code`. Separate
`resume`, `decide`, and `cancel` calls receive existing-operation inputs instead
of deployment-creation fields.

## Assertions

For every producer phase, the harness checks the actual Action step outcome,
sanitized `result-json`, NotificationEvent v1 validity/type/status, and agreement
with individual outputs such as code, status, duration, and poll count. It also
checks that generated control/OAuth credentials do not appear in results or
events.

Final assertions inspect isolated Sandbox state and counters, ensure required
phases ran, validate Build → Deploy linkage and expected resource state, and
verify the scenario's decisions, traffic update, or cancellation. Provider-suite
assertions additionally require Notify to report successful delivery, the
matching provider/event/status, and a bounded attempt count for each emitted
phase.

All expected negative outcomes must match their specified error and step
failure. Missing output, missing expected notification, an unexpected skip, a
wrong terminal state, an unvalidated event, or failed cleanup is a test failure.

## Sandbox timing and isolation

Scenarios are snapshotted when a build or deployment is created. Editing the run
scenario afterward does not change an existing operation. Only progress API
requests advance lifecycle state; list/detail/state calls are observational.
`pollsBeforeTerminal = N` produces N nonterminal polls followed by terminal state
on poll N+1. Tests use ten-second polling and a one-minute Action deadline.

Credentials and state never cross matrix jobs. Always-run cleanup deletes the
run; 24-hour service expiry is the fallback after hard termination. The
repository intentionally retains no raw credential, state, or payload artifacts.

## What a passing result proves

Offline CI verifies the harness, workflow restrictions, and mocked behavior.
Manual Sandbox suites verify the pinned Actions against the deployed simulator.
The provider suite additionally verifies webhook acceptance of actual producer
events. Representative Slack/Teams visual inspection and a separate owner
decision are still required before releasing the Actions. Initial repository
creation alone is not evidence that any live suite ran.
