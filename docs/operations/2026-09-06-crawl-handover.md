# Production handover: 6 September 2026

The host runner was installed and activated on 6 September 2026. A supervised
crawl checked all 11 website providers, exported 486 animals, and published a
release whose status and homepage bytes passed authenticated HTTPS verification.
The crawl and backup timers are enabled; the previous Windows crawl and dead-man
tasks are disabled. The old portal-only host backup timer is also disabled.

The installed code is pinned to `eec8dd52a7c3ba8c26ffc5b53efa2cd043b96351`.
The successful publication retry took 3 minutes 31 seconds, peaking at 3 GB of
memory; this is one observation with a warm dependency and image cache, not a
correction-latency guarantee. The server retains its existing release layout.
The deployment checks required repairing the existing Caddy HTML fallback;
authentication and the shared media route remain enabled.

An encrypted off-server backup exists on the maintainer PC and passed a restore
drill, including SQLite integrity and the generation's media hashes. Daily and
logon retrieval is registered. The monitoring credentials and enablement variable
are configured in GitHub; the first manual GitHub run passed after merge. Scheduled-run evidence is
recorded in the follow-up PR.

On 6 September 2026, the stale home-address restriction was repaired in both
the Hetzner firewall and the host UFW configuration. A supervised Rescue boot
used the existing SSH key; no console password reset was needed. The server
returned to normal operation and its existing homepage was verified over
authenticated HTTPS. No paid backup or new paid service was enabled.

