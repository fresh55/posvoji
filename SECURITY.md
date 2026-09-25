# Security policy

## Reporting a vulnerability

Email the project contact, [info@posvoji.si](mailto:info@posvoji.si), for
vulnerabilities or other sensitive reports. When GitHub's **Report a
vulnerability** option is available under the Security tab, you can use that
private channel instead. Ordinary GitHub issues are not confidential.

Report privately anything that could expose personal data, let an attacker
tamper with the published dataset, or abuse the crawler against shelter
websites. We aim to respond within 7 days.

## Scope notes

The public index is a static export. The separate Django shelter portal has
authentication, sessions, uploads and a database; these are also in scope.
Other sensitive areas include the build and ingest pipelines, source
permissions, crawler limits and the integrity of the published dataset.

Include the affected component, reproduction steps and likely impact, with
secrets and personal data removed. Only the current `main` branch receives
security fixes; there are no maintained historical release branches.

## Good-faith research

We will not pursue legal action against research that follows this policy.
That means you:

- report privately and give us 90 days, or until a fix ships, before
  disclosing publicly;
- test against a local checkout where you can; the portal setup is in
  [`apps/portal/README.md`](apps/portal/README.md);
- do not degrade the site or the portal, and do not run automated scans or
  load tests against them;
- stop as soon as you reach personal data, keep none of it and tell us what
  you accessed.

Shelter websites are third-party systems. This policy does not authorise any
testing against them.
