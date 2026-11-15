# Local reporting candidate validation

The reporting source candidates depend on unpublished notification-contract
0.0.6. Normal harness dependencies remain exact published 0.0.4/0.0.3 and all
hosted workflow Action pins remain unchanged. This local, opt-in test is separate
from normal offline CI and from the manually guarded hosted suites. No future
unmerged commit is installed into a hosted workflow.

## What executes

The harness uses all five actual standalone candidate bundles, the actual public
shared contract exports/schema, and the existing scenario catalog and run
controller. It does not copy Action, OAuth, token, retry or provider-rendering
implementations. A test-only transport maps the fixed public Sandbox origin to
one explicit local HTTPS loopback server. Other fetch and native HTTP(S) calls
from Action children are denied. Provider requests return local synthetic
responses through the actual Notify delivery code; they never reach a webhook.

- Build/deploy: existing rolling-success, build-failure and green-manual scenarios.
  Assert actual results/events, successful prerequisite handoff, target operation
  counts, input-name parity, secret masking, semantic status and summary tables.
- Cleanup: existing isolated 105-build mixed fixture and repeat invocation,
  hardcoded dry-run, complete result/reason expectations, warning issues and
  zero target mutations. Control fixture operations are counted separately.
- Setup: invalid input in a standalone child with all network denied; require a
  valid failure event, input context, failure summary and zero requests. Success
  and cache scenarios remain in Setup's own Action tests.
- Notify: every resulting producer event through both actual provider renderers,
  with mocked successful delivery. Verify shared labels/icons, provider colors,
  complete producer inputs, masked values, explanations and summary inputs.
  Mocked delivery rejection also verifies warning versus failure summaries.

No actual SAP or customer credentials are accepted. Child environments contain
only synthetic GitHub context, generated local-run values and selected input
strings; package/GitHub/Cloudflare credentials are not inherited. The top-level
loopback guard runs before subprocesses or network operations.

## Prepare the reviewed private workspace

Use Node 24.21.0 and pnpm 12.6.0. Separately review the exact shared tarball, source
commits/dirty changes and all five bundles after each repository's complete
quality gate. Build/install candidates only in isolated private temporary
consumers. No `file:` dependency is committed to a normal repository.

In a private copy of this harness, temporarily replace only its contract
dependency with `file:/absolute/path/to/reviewed-notification-contract-0.0.6.tgz`
and install. The command verifies that this exact path is in the private manifest,
that metadata is 0.0.6, and that the installed public package bytes match every
reviewed tarball entry. The normal repository cannot run this path using 0.0.4.

Create a private JSON manifest with this shape; placeholders must be replaced
with reviewed exact values. All five Action entries are mandatory:

```json
{
  "schemaVersion": 1,
  "classification": "unpublished-source-candidate",
  "contract": {
    "sourcePath": "/private/tmp/reviewed-action-kit",
    "sourceSha": "<full reviewed commit SHA>",
    "sourceHash": "<SHA256 of current tracked/untracked source files>",
    "tarball": "/private/tmp/reviewed-notification-contract-0.0.6.tgz",
    "sha256": "<reviewed tarball SHA256>",
    "integrity": "sha512-<reviewed base64 digest>"
  },
  "sandbox": {
    "sourcePath": "/private/tmp/reviewed-local-sandbox",
    "sourceSha": "<full reviewed commit SHA>",
    "sourceHash": "<SHA256 of current source files>"
  },
  "actions": {
    "setup-commercekit": {
      "sourcePath": "/private/tmp/reviewed-action-source",
      "consumerPath": "/private/tmp/isolated-source-packed-consumer",
      "sourceSha": "<full reviewed commit SHA>",
      "sourceHash": "<SHA256 of current source files>",
      "bundleSha256": "<reviewed dist/index.js SHA256>"
    }
  }
}
```

Repeat the Action object for `ccv2-build`, `ccv2-deploy`, `ccv2-build-cleanup` and
`notify`. `sourceProvenance` from `scripts/candidate-support.mjs` calculates the
source digest and records the Git commit/tree, dirty state/fingerprint and runtime
source digest. Matching private runtime source and reviewed bundle hashes is
mandatory. Compute fingerprints after sources are frozen; a changed file requires
a new reviewed manifest. Hashes identify inputs; they do not confer approval.

In the private workspace:

```sh
REPORTING_CANDIDATE_MANIFEST=/private/tmp/reviewed-reporting-manifest.json \
REPORTING_CANDIDATE_LOCAL_ORIGIN=https://localhost:18987 \
pnpm candidate:reporting
```

Install the existing local Sandbox dependencies in its reviewed checkout first.
OpenSSL and a free local port are required. Only HTTPS localhost/127.0.0.1/::1
origins with an explicit unprivileged port are accepted; userinfo, query, fragment
and non-root paths are rejected. TLS is verified using a generated local test
certificate, never disabled. Hosted origin and approval/confirmation guards in
the existing runner remain unchanged.

## Bounds and cleanup

A 270-second execution deadline reserves teardown time within five minutes.
Control/target reads have finite response/request bounds; each standalone child
has a 60-second kill limit. SIGINT/SIGTERM abort pending work. Generated control
credentials exist only in memory and private temporary files with 0600/0700
permissions. Action stdout/stderr is drained without retaining mask commands,
raw responses or secrets.

Every scenario uses the existing always-run controller cleanup, verifies run
absence, and keeps Cleanup's fixture/control operations separate from target API
mutation counts. Finally blocks stop the local worker and remove all private
credential, output and payload files even after assertion failure. The retained
private evidence JSON contains source/bundle/summary hashes, safe aggregate
counts/statuses and cleanup outcome; it contains no tokens or raw API/card data.

## Evidence and gates

- PASS: normal published-dependency frozen install and full `pnpm quality`: 71
  offline tests, formatting, lint, unchanged workflow policy, public scan and
  dependency audit (no known vulnerabilities). Nine tests cover new local/artifact guards and child cancellation; hosted workflow/Action pins and dependencies remain unchanged.
- PASS: all-five reviewed v2 candidate replay against exact contract source
  `475cc4db42f79310240496201f90d7047aa54330`, with 24 Action result/summary
  records, 4 validated isolated runs created/removed with absence verified, zero
  Cleanup target mutations and zero Setup invalid-input network requests.
  See [retained safe evidence](reporting-candidate-evidence.json).
- BLOCKED: normal consumer registry readiness until separately authorized 0.0.6
  publication, verified exact repinning/bundling and green required checks.
- NOT RUN: new hosted dispatches, live provider sends, real SAP validation,
  Action/package publication, Git tags or deployments.

Candidate success does not authorize publication, deployment or production
cleanup. Hosted adoption must use future reviewed immutable commits and rerun
its authorized suites independently; this change does not alter live pins.

## Executed reviewed v2 evidence

Both local candidate runs passed. The first completed in **55,725 ms**; the
retained final replay adds explicit run-removal counters and runner-code hashes
and completed in **55708 ms**. It uses these exact clean reviewed producer
source commits and the real private bundles listed in the evidence JSON:

| Source                | Reviewed commit                            |
| --------------------- | ------------------------------------------ |
| notification-contract | `475cc4db42f79310240496201f90d7047aa54330` |
| setup-commercekit     | `5b8f44d20ecefa8196800f9c90ee5ecf79e48a5c` |
| ccv2-build            | `5b74b36aa661c21835ab57190bf4950cd842fc5c` |
| ccv2-deploy           | `56e037ca68d5adbc53438733020b65a8b4f65b2f` |
| ccv2-build-cleanup    | `4686db93bbf0accbf232a82874421920d4598b56` |
| notify                | `41e699d13bd183bd51551e45c386cf9e8f77d6dd` |
| local Sandbox         | `ad7a4be86f60243f9005cea9feb63abbf9dbf01a` |

The shared tarball SHA256 is
`e4b79576328c2992a96fed087e9ba6e63970e8b54d6fca976a6652702a7a73a9`,
with integrity
`sha512-n6F84900sDPBeYm5dnf8HLCM9B2DUVATEeF717dqKsSXTJtq1FIj/3hZ2UcNTtXe7v8R90HYF6HIom4auM8Kyw==`.
Every installed package byte was compared with that artifact before execution.

The 24 records consist of three Build invocations, two Deploy invocations, two
Cleanup invocations, one invalid-input Setup invocation, fourteen mocked Notify
deliveries (seven producer events through both providers), and two mocked Notify
delivery warning/failure cases. Tests check actual returned events/results, all
Action metadata input names, known-secret/JWT absence, safe error/issue details,
shared icons/status tables, Slack/Teams colors, provider limits and summary
parity. Build/Deploy target creation is confined to the isolated local runs;
Cleanup target mutations remain zero independently of fixture/control operations.

The private harness copy was deliberately initialized without a Git commit and
its manifest/lock were changed only for exact file:tarball installation. Its
`harnessSource` proof therefore honestly records **unborn-private-workspace,
dirty=true**; this is not a claim of a clean registry-installed harness commit.
The five actual Action sources and contract/Sandbox sources were clean reviewed
commits. Explicit runner-code hashes in the evidence identify the exercised
logic independently of the private manifest transform. Normal dependencies,
hosted Action pins and workflow guards in this repository remain unchanged.

No hosted workflow, real SAP endpoint or live notification provider was invoked.
No package, Action release, Git tag or deployment was created. Production SAP
eligibility and normal registry/release adoption remain separately blocked.

Companion draft changes: [action-kit #13](https://github.com/commercekit-tools/action-kit/pull/13),
[Build #8](https://github.com/commercekit-tools/ccv2-build/pull/8),
[Deploy #10](https://github.com/commercekit-tools/ccv2-deploy/pull/10),
[cleanup #8](https://github.com/commercekit-tools/ccv2-build-cleanup/pull/8),
[Setup #14](https://github.com/commercekit-tools/setup-commercekit/pull/14),
and [Notify #19](https://github.com/commercekit-tools/notify/pull/19).
