# Security policy

This public repository contains synthetic integration fixtures and test code.
Real SAP credentials, Cloudflare secrets, webhook URLs, access tokens, and
customer content must never enter committed source, logs, summaries, artifacts,
or issues.

Sandbox run creation returns temporary control and OAuth credentials. The
harness masks them immediately, retains them only in private runner-temporary
files and same-job environment values, and attempts to delete the run in
always-run cleanup. Hard runner termination can prevent cleanup; the Sandbox's
24-hour expiry is the fallback. Expiry does not replace cleanup assertions.

Slack and Teams webhook URLs are credentials. Configure only dedicated test
destinations in the `provider-smoke` environment. Live notifications require a
manual dispatch and their own confirmation. Check environment protection before
dispatch; creating an environment in YAML does not configure required reviewers
or branch restrictions.

GitHub Packages uses the job's automatic read-only `GITHUB_TOKEN` for dependency
installation. Do not add a long-lived package PAT as a repository secret. Local
contributors keep read credentials in user-level or ephemeral authentication
configuration outside this repository.

The control API and Management API have different authorization schemes. Keep
control tokens scoped to their run, use the existing shared client for Management
requests, and preserve fixed-origin checks, bounded reads, timeouts, and redirect
rejection. Never weaken provider URL validation to send Slack traffic to a
generic mock endpoint.

Report vulnerabilities through GitHub private vulnerability reporting when
available, or GitHub's private security advisory reporting flow. Do not post
credentials or exploit details in public issues. If a test webhook or generated
credential is exposed, revoke/delete the destination or run and follow the
organization's incident procedure.
