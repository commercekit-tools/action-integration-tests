# Registry-installed reporting validation

## Published dependency

Normal harness installation now pins exact published
`@commercekit-tools/notification-contract@0.0.6` with ccv2-client 0.0.3 unchanged.
The authorized [package-only workflow 43678067818](https://github.com/commercekit-tools/action-kit/actions/runs/43678067818)
published 0.0.6 from action-kit main
`3fecce40414d709884fa48e48eca278f470b20b0` after exact-main CI, all three OS jobs
and CodeQL passed. [CI](https://github.com/commercekit-tools/action-kit/actions/runs/43677942127),
[CodeQL](https://github.com/commercekit-tools/action-kit/actions/runs/43677942074)
and processed main analysis `2169851728` provide the publication gate evidence.
No Git release tag or Action release was created.

Registry metadata and the downloaded artifact were independently verified:

- SHA256: `e4b79576328c2992a96fed087e9ba6e63970e8b54d6fca976a6652702a7a73a9`.
- Integrity: `sha512-n6F84900sDPBeYm5dnf8HLCM9B2DUVATEeF717dqKsSXTJtq1FIj/3hZ2UcNTtXe7v8R90HYF6HIom4auM8Kyw==`.
- Registry shasum: `8030f643d1dd6d741caa2c3c0ba321ad82b30cca`.
- Normal `pnpm install --frozen-lockfile`: PASS, with the real GitHub Packages
  0.0.6 tarball resolution and no file: dependency or source alias.

[Earlier candidate evidence](REPORTING-CANDIDATES.md) remains historical. It is
not used by the normal registry validator or ordinary CI.

## What executes

`pnpm test:reporting` is an explicit local-only integration command. It verifies
normal registry manifests/locks, public package exports/schema, installed package
bytes against an independently downloaded registry tarball, source commit/tree/
dirty fingerprints, matching runtime sources and exact bundle hashes. The five
Actions execute as standalone bundled processes without their own node_modules.
The harness does not copy production Action, authentication, token, retry or
provider-rendering implementations.

The existing scenario catalog, run controller and domain assertions are reused:

- Three Build invocations: rolling success, build failure and a successful
  prerequisite for the green/manual scenario.
- Two Deploy invocations: rolling success and action-required/manual decision.
- Cleanup's existing 105-build mixed fixture and repeat: dry-run, warning
  issues, complete input/count/result parity and zero target API mutations.
- Setup invalid input: failure notification/summary and zero network requests.
- Notify: seven actual producer events through both real provider renderers
  with mocked delivery, plus mocked delivery-warning/failure cases.

Both providers must retain every producer input name, safe values, shared status
icons/labels, colors, errors/issues and size limits. Every Action summary must
include matching semantic status, result/input tables and masked confidential
values. Known-secret and JWT absence are asserted.

The fixed public Sandbox origin maps only to a verified local HTTPS loopback
server in this command. Child fetch/native HTTP(S) requests to other destinations
are denied; provider responses are mocked before any network connection. Child
environments never inherit package/GitHub/Cloudflare credentials. Hosted
workflow origin/approval/confirmation guards remain separate and unchanged.

## Run locally

Use Node 24.21.0 and pnpm 12.6.0. Install normal frozen dependencies in this
repository and the five reviewed Action checkouts; build each normal committed
bundle and pass its repository's full validation. Install the existing reviewed
local Sandbox's dependencies. OpenSSL and a free local HTTPS port are required.

Download the exact published tarball for byte verification, without executing
package lifecycle scripts:

```sh
npm pack @commercekit-tools/notification-contract@0.0.6 --ignore-scripts \
  --pack-destination /private/tmp/reviewed-registry-package
```

Create a private JSON manifest with reviewed actual values; all five Action
entries are mandatory. Source and consumer paths may be identical normal
registry-installed repositories:

```json
{
  "schemaVersion": 1,
  "classification": "registry-installed",
  "contract": {
    "version": "0.0.6",
    "sourcePath": "/private/tmp/reviewed-action-kit",
    "sourceSha": "<reviewed full commit SHA>",
    "sourceHash": "<reviewed source SHA256>",
    "tarball": "/private/tmp/reviewed-registry-package/commercekit-tools-notification-contract-0.0.6.tgz",
    "registryTarball": "https://npm.pkg.github.com/download/@commercekit-tools/notification-contract/0.0.6/8030f643d1dd6d741caa2c3c0ba321ad82b30cca",
    "sha256": "e4b79576328c2992a96fed087e9ba6e63970e8b54d6fca976a6652702a7a73a9",
    "integrity": "sha512-n6F84900sDPBeYm5dnf8HLCM9B2DUVATEeF717dqKsSXTJtq1FIj/3hZ2UcNTtXe7v8R90HYF6HIom4auM8Kyw=="
  },
  "sandbox": {
    "sourcePath": "/private/tmp/reviewed-local-sandbox",
    "sourceSha": "<reviewed full commit SHA>",
    "sourceHash": "<reviewed source SHA256>"
  },
  "actions": {
    "setup-commercekit": {
      "sourcePath": "/private/tmp/reviewed-normal-action",
      "consumerPath": "/private/tmp/reviewed-normal-action",
      "sourceSha": "<reviewed full commit SHA>",
      "sourceHash": "<reviewed source SHA256>",
      "bundleSha256": "<reviewed dist/index.js SHA256>"
    }
  }
}
```

Repeat the Action entry for `ccv2-build`, `ccv2-deploy`, `ccv2-build-cleanup` and
`notify`. `sourceProvenance` in `scripts/reporting-support.mjs` calculates source
fingerprints. Freeze and review sources before preparing the manifest; changed
files require a fresh reviewed fingerprint. Hashes identify inputs, not approval.

```sh
REPORTING_MANIFEST=/private/tmp/reviewed-reporting-manifest.json \
REPORTING_LOCAL_ORIGIN=https://localhost:18987 \
pnpm test:reporting
```

Only HTTPS localhost/127.0.0.1/::1 origins with explicit unprivileged ports and
root paths are accepted. Credentials, query and fragment are rejected. Generated
local TLS certificates are trusted explicitly; verification is never disabled.
An execution deadline reserves teardown time within five minutes; child/request/
response bounds remain finite. SIGINT/SIGTERM cancel work, owned process groups
are stopped, all isolated runs are removed through finally cleanup with absence
verified, and temporary credential/output/payload files are deleted.

Retained evidence contains safe statuses/counts and source, bundle, runner-code
and summary hashes. It never contains credentials, raw API responses or provider
payloads. Fixture/control operations are separate from Cleanup target mutations.

## Current execution status

- PASS: exact registry 0.0.6 frozen installation and downloaded artifact proof;
  focused registry guard tests reject file links/ranges/foreign registries and
  integrity drift.
- PASS: complete ordinary normal-registry `pnpm quality`, 76 offline tests and
  zero skips; formatting, lint, unchanged workflow policy, public scan and full
  dependency audit passed with no known vulnerabilities.
- PASS: early combined five normal registry bundles on clean reviewed branch
  heads, 24 records in 56,513 ms; four isolated runs created/removed with absence
  verified, Cleanup zero target mutations, Setup zero network calls and strict
  provider mocks. [Safe early evidence](reporting-registry-branch-evidence.json)
  records exact normal source/bundle/lock proofs. Final merged-main pins and
  their replay remain pending.
- NOT RUN: new hosted Sandbox/provider workflows, real SAP validation.
- BLOCKED: real SAP apply eligibility, operational review and separate owner
  non-production/release approvals. Green tests do not authorize real deletion.

Hosted workflow pins now use the five actual reviewed merged main commits
listed below. `action-inputs.json` records their public input names, extracted
from each exact Action metadata file and bound to the matching ref in offline
policy checks. Runtime assertions require every input, authentication masking,
validation flags and event/result parity. Cleanup additionally requires warning
severity with accurate protected/blocked counts and explicit safety issues.
No future/unmerged commit is presented as an adopted hosted Action. Package publication does not create an Action
release, Git tag, deployment or permission for SAP operations.

## Normal-registry preflight correction

The first normal opt-in attempt stopped before starting any local Worker or
Action process: pnpm 12 locks contain separate package-manager and application
YAML documents. The harness now parses the bounded document set and requires
exactly one application graph containing the pinned contract; duplicate, missing
or malformed graphs are rejected. A dedicated regression test covers both
normal pnpm 12 and single-document locks. The corrected normal run passed all
24 actual bundled cases. This was a test-tooling compatibility fix, not a
consumer failure or package-integrity drift.

The early registry run used clean normal Action source heads and real published
0.0.6 dependencies/bundles. Its harness proof honestly records base commit
`b1dd29a167289b083688b2ad45ddb492bcc5190a` with the parser correction dirty at
execution time. The recorded runner-code hashes match the correction committed
after validation. Final merged-main validation will be recorded separately.

## Adopted immutable merged Action revisions

| Action  | Adopted main commit                        |
| ------- | ------------------------------------------ |
| Setup   | `52a5a098d89f9ef2c42a234b4c3baa5d60a7a896` |
| Build   | `a4e4ede0ffba3f3fec6b16ea1c2324375d383940` |
| Deploy  | `9486574b5abc7a9d85ec2809b03a02380dcf7ee2` |
| Cleanup | `8b1786b731be8d2d3fac137cd358d2ee5488bd58` |
| Notify  | `abc752ead104a6e5153c5f166d04ee5e595e0ca6` |

Each source was checked out separately at its exact main commit and installed
with normal frozen registry dependencies. No owner working tree was replaced,
no file:tarball dependency was used, and no hosted workflow was dispatched. The
final all-five main replay is recorded after execution.
