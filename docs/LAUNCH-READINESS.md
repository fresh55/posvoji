# Launch readiness — 20 September 2026

The site remains a gated demo. Repository visibility and removal of the demo
gate are separate launch decisions.

## Access and gate removal

SSH with the configured recovery key succeeded from the operator's current
connection. This proves today's path through both firewalls; it does not
guarantee access after the client IP changes. No firewall rules were widened.

An ungated copy of the production Caddy configuration was validated and run on
`127.0.0.1:18881`, without opening a public port. Guest requests returned the
exact exported homepage, Slovenian and English about pages, manifest, release
status and security.txt. A missing page and `/private/dataset.published.json`
returned the branded `404`. The rehearsal process was stopped afterwards.

The host has `/etc/caddy/Caddyfile.launch-ready`, with the guest matcher,
`basic_auth` and 401 error handler removed. Its `.source.sha256` companion
records the live Caddyfile used to prepare it. Before applying it on launch
day, compare that hash with the live file: if it differs, regenerate and
rehearse the candidate so newer host changes are not overwritten. Back up the
live file, validate the candidate, install it and reload through systemd.
Verify guest pages, the branded 404, private-file isolation and the health
monitor afterwards. Restore the backup and reload if any check fails.

The candidate is prepared, **not applied**. Unsetting `POSVOJI_DEMO_KEY`
still does not launch the site; it restores Basic authentication.

## Headers and public assets

HSTS is at `max-age=86400` after a successful TLS check of the site, www, API
and mail hosts. The year-long stage must follow at least 48 hours of observation
and another TLS check. `preload` is still omitted.

The manifest, its three PNG icons and `/.well-known/security.txt` all return
`200` without credentials. They do not require removal of the demo gate.

## Monitoring and alerts

The host health timer runs every ten minutes. Health, crawl, backup and portal
failures now invoke an SMTP alert to the privately configured operator address.
A deliberate test unit failed, its `OnFailure` handler ran, and SMTP accepted
the test notice. The operator confirmed receipt of both the portal mail test
and the host failure test.

The external workflow is opt-in independently of repository visibility. It
requests hourly checks to bound private-repository Actions usage, and emails
failed checks through the existing SMTP account. GitHub scheduling is best
effort; neither layer guarantees a ten-minute external alert deadline.
The repository remains private. Public security settings from PR #263 still
belong to a future decision to publish the repository.

## Shelter portal

The portal login was already reachable before gate removal. The production
SMTP password is set, no migrations are pending, and `check_mail` through the
SMTP backend accepted a test message to the operator's confirmed address.
The service was restarted on tested main revision `9491838c1819`; the API
CSRF endpoint returned `200`. The checkout was transferred as a verified Git
bundle through SSH because the host has no working GitHub fetch credential.

Johanca and Oskar each have an active portal membership and zero listings.
They need shelter-authored listings; inventing animals or copying social
platform posts is not an acceptable way to fill those pages. Oskar has a
website but no supported animal catalogue. Johanca is represented on its
veterinary practice's website.

Mala hiša's institutional address, `malahisa@siol.net`, was verified on
<https://zavetisce-malahisa.si/kontakt/> through the SDK's polite client and
added to the registry. Its enabled, permitted provider is eligible for a
registry membership. Seed the promoted registry without `--prune`, and verify
the resulting membership before announcing portal access.

## Release layout and retired locks

The host was still on layout v1. Existing releases received the documented
compatibility self-links, Caddy moved to `/srv/posvoji/current/public`, and
both the active-config validator and exact live-byte checks passed before
`/srv/posvoji/.layout-v2` was created. The gate remained active throughout.
The pre-change configuration is saved at
`/etc/caddy/Caddyfile.before-launch-prep-20260920T185557Z`.

The first complete v2 release is
`3a12474f40a3-20260920T185915Z-d4ae7ea46011fbb8`. Its `public/` is a real
directory, and `private/` holds both datasets and `publication.json`.
Authenticated HTTPS requests to all three private-file paths returned `404`;
the full production monitor passed and all three host timers were active.

The current boot had 163 retired artifact locks containing about 61 KB of
owner records. These are deliberate safety tombstones. The existing cleanup
only removes eligible records from previous boots; it must not delete them
on age alone. Their size does not justify an unscheduled reboot.
