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
  records exact normal source/bundle/lock proofs.
- PASS: initial merged-main replay, 24 records in 55,872 ms, with the same
  read-only/mocked boundaries and all source trees clean. The executed harness
  was committed as `089b7fae37497ddb0cd2bf4dfc0e2b3d4fe3bba3`.
  [Initial-main evidence](reporting-registry-initial-main-evidence.json) is
  retained separately from the final security-follow-up replay.
- PASS: final security-follow-up main replay, **24 records in 55,745 ms**,
  from clean committed harness `a4224df787c277b88deb1458eaa9162e6838967c`
  against all five final main revisions below.
  [Final safe evidence](reporting-registry-main-evidence.json) records exact
  source/tree/bundle/registry/input-metadata/runner-code hashes. All sources
  were clean, four runs were removed with absence verified, both Cleanup
  passes had zero target mutations, Setup had zero network calls, and all
  16 provider calls were mock-only.
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
after validation. The initial merged-main run then passed from a clean committed harness; its
runner-code hashes and input metadata hash independently match the executed
files. Final security-follow-up main validation is recorded separately.

## Adopted immutable merged Action revisions

| Action  | Adopted main commit                        |
| ------- | ------------------------------------------ |
| Setup   | `52a5a098d89f9ef2c42a234b4c3baa5d60a7a896` |
| Build   | `fc65ee281f39b98d2cecad36ff93d40cf055fbc2` |
| Deploy  | `1af852b9a00e981da4ea13565bb18c7ce7fda27f` |
| Cleanup | `8b1786b731be8d2d3fac137cd358d2ee5488bd58` |
| Notify  | `abc752ead104a6e5153c5f166d04ee5e595e0ca6` |

Each source was checked out separately at its exact main commit and installed
with normal frozen registry dependencies. No owner working tree was replaced,
no file:tarball dependency was used, and no hosted workflow was dispatched. The
initial all-five main replay is archived above; the final security-follow-up
main replay passed separately, with every source matching the adopted refs.

## Post-merge security verification

The initial merged Build/Deploy jobs were green, but processed main analyses
`2169885840` and `2169885904` contained two and three
`js/bad-code-sanitization` findings in test-generated JavaScript preloads.
Those findings blocked final adoption. Narrow test-only
[Build PR #10](https://github.com/commercekit-tools/ccv2-build/pull/10) and
[Deploy PR #11](https://github.com/commercekit-tools/ccv2-deploy/pull/11)
replaced interpolation with static preload files and child-environment data.
Both merged only after complete validation and processed zero-finding PR
analyses. Their production bundles retained the independently recorded hashes;
the final local replay verified those exact main sources and bundles again.

Final main evidence was independently checked for all six repositories. Every
processed analysis listed below has zero results, no processing errors/warnings
and zero open main alerts. Build's two and Deploy's three initial findings are
fixed; a green CodeQL job alone is not used as proof of zero findings.

| Repository | Main validation                                                                                 | CodeQL job                                                                                      | Processed main analysis | Open main alerts |
| ---------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ----------------------- | ---------------- |
| action-kit | [43677942127](https://github.com/commercekit-tools/action-kit/actions/runs/43677942127)         | [43677942074](https://github.com/commercekit-tools/action-kit/actions/runs/43677942074)         | `2169851728`            | 0                |
| Notify     | [43679092935](https://github.com/commercekit-tools/notify/actions/runs/43679092935)             | [43679092926](https://github.com/commercekit-tools/notify/actions/runs/43679092926)             | `2169885501`            | 0                |
| Setup      | [43679114996](https://github.com/commercekit-tools/setup-commercekit/actions/runs/43679114996)  | [43679114994](https://github.com/commercekit-tools/setup-commercekit/actions/runs/43679114994)  | `2169886190`            | 0                |
| Cleanup    | [43679344145](https://github.com/commercekit-tools/ccv2-build-cleanup/actions/runs/43679344145) | [43679344327](https://github.com/commercekit-tools/ccv2-build-cleanup/actions/runs/43679344327) | `2169892997`            | 0                |
| Build      | [43680545359](https://github.com/commercekit-tools/ccv2-build/actions/runs/43680545359)         | [43680545418](https://github.com/commercekit-tools/ccv2-build/actions/runs/43680545418)         | `2169929303`            | 0                |
| Deploy     | [43680764774](https://github.com/commercekit-tools/ccv2-deploy/actions/runs/43680764774)        | [43680764683](https://github.com/commercekit-tools/ccv2-deploy/actions/runs/43680764683)        | `2169935725`            | 0                |

Setup's six native-runner jobs plus quality passed. Its existing Main ruleset
`25021617` required one review and explicitly allowed OrganizationAdmin always
bypass. After verifying `anilkreddy` held that role and every check was green,
the authorized merge used that existing administrator exception. No approval
was fabricated and no ruleset was changed. Other implementation merges used
normal exact-head guards. Cleanup's strict main protection still requires
`validate` (app 15368) and `CodeQL` (app 57789), with administrator enforcement
enabled and force-push/deletion disabled.

## Final executed commands and limits

| Command/check                                                                               | Outcome                                                          |
| ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `pnpm install --frozen-lockfile` in this harness and five exact-main read-only checkouts    | PASS, real registry 0.0.6; no local overrides                    |
| `pnpm quality` after final five pins                                                        | PASS, 76 tests, zero skips, format/lint/policy/public scan/audit |
| `actionlint .github/workflows/*.yml`                                                        | PASS                                                             |
| Exact public `action.yml` input-name comparison for all five adopted refs                   | PASS                                                             |
| `REPORTING_MANIFEST=... REPORTING_LOCAL_ORIGIN=https://localhost:18987 pnpm test:reporting` | PASS, 24 records in 55,745 ms                                    |
| Source/runner/input metadata hash and lifecycle assertions against final safe evidence      | PASS                                                             |

An earlier restricted-network quality rerun could not resolve npm's advisory
endpoint. Its authorized network retry passed, and the complete final quality
command passed afterward; the failed attempt is not reported as a pass. A narrow
independent source review found no generated-code, privacy or network-guard
defect in this harness; it did not execute CodeQL or replace processed analysis
evidence.

The final replay used the normal published dependency without candidate flags,
file links or rewritten package metadata. The five Action bundles ran as
standalone processes. Source and consumer paths matched the normal exact-main
checkouts; public package byte/SRI/schema/export proof ran before any target
operation. The clean executed harness commit and runtime/source hashes remain
in the evidence even though this later report-only commit adds the result file.

No new hosted Sandbox workflow was dispatched. All provider delivery was
mocked; no real SAP, production cleanup, deployment, Action release or Git tag
was performed. Package 0.0.6 publication was separately authorized and completed
as recorded above. Remaining gates are production SAP eligibility evidence,
operational/non-production owner approval and any future Action release
approval. Sandbox passes do not prove SAP deletion guarantees or authorize
real deletion.
