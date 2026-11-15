# Historical reporting source-candidate validation

Notification-contract 0.0.6 was subsequently published through the authorized
package-only workflow. Current normal installation and reporting validation use
that exact registry version; see [REPORTING.md](REPORTING.md). The candidate-only
entry point, file:tarball checks and consumer overrides have been retired.

The original candidate implementation and reproduction instructions are retained
at immutable harness commit
[`724e86661c4f6b4062721961633e190cde942395`](https://github.com/commercekit-tools/action-integration-tests/tree/724e86661c4f6b4062721961633e190cde942395)
([instructions](https://github.com/commercekit-tools/action-integration-tests/blob/724e86661c4f6b4062721961633e190cde942395/docs/REPORTING-CANDIDATES.md),
[script](https://github.com/commercekit-tools/action-integration-tests/blob/724e86661c4f6b4062721961633e190cde942395/scripts/validate-reporting-candidates.mjs)).
The retained [candidate evidence JSON](reporting-candidate-evidence.json) records
24 successful local Action result/summary records, exact source/tarball/bundle
hashes and four isolated runs removed with absence verified.

That private harness copy deliberately used an unborn Git workspace and a
file:tarball manifest transform. Its dirty/unborn proof is historical and honest;
it is not described as a clean registry-installed build. All five producer
sources were clean reviewed commits. No candidate artifact was represented as
a published registry dependency, and no local dependency link was committed.

This archived phase performed no hosted workflow dispatch, live provider send,
package publication, Action release, Git tag, deployment or real SAP operation.
The later 0.0.6 package publication was separately authorized and is documented
with its actual provenance in the current validation guide.
