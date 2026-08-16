# Security policy

## Reporting a vulnerability

Please use GitHub's private vulnerability reporting ("Report a vulnerability"
under the Security tab) instead of opening a public issue.

Report privately anything that could expose personal data, let an attacker
tamper with the published dataset, or abuse the crawler against shelter
websites. We aim to respond within 7 days.

## Scope notes

The production site is static files on a CDN, so there is no server-side attack
surface beyond the build pipeline. The most sensitive parts of this project are
the ingest pipeline (it must never collect personal data or overload shelter
sites) and the integrity of the published dataset.
