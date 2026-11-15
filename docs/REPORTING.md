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
- PENDING: final security-follow-up main replay. Both narrow test-only fixes
  have merged after green validation and processed zero-finding PR analyses;
  Build exact-main analysis is also clear. Green job conclusions alone do
  not establish zero findings.
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
initial all-five main replay is archived above; final security-follow-up main
refs and their replay will be recorded after execution.

## Post-merge security verification

The initial merged Build/Deploy validation and CodeQL jobs were green, but the
processed main analyses reported two and three `js/bad-code-sanitization`
findings respectively, in test-generated JavaScript preloads. Those findings
were an explicit final-adoption gate and are resolved by the narrow follow-ups. The follow-up uses static preload files
with data passed through child environment variables; the runtime bundles are
independently verified again in the final local replay. A green CodeQL job is
not presented as proof of zero findings.

| Repository           | Main validation                                                                                 | CodeQL job                                                                                      | Initial processed analysis | Findings at initial analysis    |
| -------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | -------------------------- | ------------------------------- |
| action-kit           | [43677942127](https://github.com/commercekit-tools/action-kit/actions/runs/43677942127)         | [43677942074](https://github.com/commercekit-tools/action-kit/actions/runs/43677942074)         | `2169851728`               | 0                               |
| Notify               | [43679092935](https://github.com/commercekit-tools/notify/actions/runs/43679092935)             | [43679092926](https://github.com/commercekit-tools/notify/actions/runs/43679092926)             | `2169885501`               | 0                               |
| Setup                | [43679114996](https://github.com/commercekit-tools/setup-commercekit/actions/runs/43679114996)  | [43679114994](https://github.com/commercekit-tools/setup-commercekit/actions/runs/43679114994)  | `2169886190`               | 0                               |
| Cleanup              | [43679344145](https://github.com/commercekit-tools/ccv2-build-cleanup/actions/runs/43679344145) | [43679344327](https://github.com/commercekit-tools/ccv2-build-cleanup/actions/runs/43679344327) | `2169892997`               | 0                               |
| Build, initial main  | [43679098958](https://github.com/commercekit-tools/ccv2-build/actions/runs/43679098958)         | [43679098963](https://github.com/commercekit-tools/ccv2-build/actions/runs/43679098963)         | `2169885840`               | 2, resolved by test-only PR #10 |
| Deploy, initial main | [43679105484](https://github.com/commercekit-tools/ccv2-deploy/actions/runs/43679105484)        | [43679105493](https://github.com/commercekit-tools/ccv2-deploy/actions/runs/43679105493)        | `2169885904`               | 3, resolved by test-only PR #11 |

Setup's six native-runner jobs plus quality passed. Cleanup's main protection
still requires `validate` (app 15368) and `CodeQL` (app 57789), with administrator
enforcement enabled and force-push/deletion disabled. Main analysis evidence for
the four zero-finding repositories reported no processing errors or warnings.

The ordinary local validation rerun passed format/lint, 76 tests, workflow policy
and public scan. Its first audit attempt could not resolve the public advisory
endpoint in the restricted network; the authorized network retry passed with no
known vulnerabilities. The final full quality command is recorded after the
security-follow-up pins are adopted. A narrow independent source review found
no generated-code, privacy or network-guard defect in this harness; it did not
execute CodeQL or replace the recorded analysis evidence.

Final Build main `fc65ee281f39b98d2cecad36ff93d40cf055fbc2` passed
[CI 43680545359](https://github.com/commercekit-tools/ccv2-build/actions/runs/43680545359)
and [CodeQL 43680545418](https://github.com/commercekit-tools/ccv2-build/actions/runs/43680545418).
Processed exact-main analysis `2169929303` reported zero results, no processing
errors/warnings, and zero open main alerts; both initial findings are fixed.

Deploy test-only PR #11 merged as final main
`1af852b9a00e981da4ea13565bb18c7ce7fda27f` after latest
[CI 43680659831](https://github.com/commercekit-tools/ccv2-deploy/actions/runs/43680659831)
and [CodeQL 43680659853](https://github.com/commercekit-tools/ccv2-deploy/actions/runs/43680659853)
passed; processed PR analysis `2169932326` contained zero results and no errors
or warnings. Post-merge main analysis is recorded after it completes.
