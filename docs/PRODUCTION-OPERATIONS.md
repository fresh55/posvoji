# Production crawl operations

## Deployment state

The host runner and recovery tools in this change are implemented, but are not
installed or enabled in production yet. The existing Windows crawl task remains
the active scheduler until the supervised handover below succeeds. Do not infer
activation from the presence of unit files in Git.

On 6 September 2026, the stale home-address restriction was repaired in both
the Hetzner firewall and the host UFW configuration. A supervised Rescue boot
used the existing SSH key; no console password reset was needed. The server
returned to normal operation and its existing homepage was verified over
authenticated HTTPS. No paid backup or new paid service was enabled.

## Operating contract

The installed systemd timer starts at 06:00 and 18:00 Europe/Ljubljana, with up
to 15 minutes of jitter. It catches up after downtime. The service uses one CPU
worth of quota, bounded memory, low I/O priority and a ten-hour timeout. These
are initial limits to measure on the actual server, not a build-time promise.

The timer runs an installed, clean commit at `/srv/posvoji/app`, matching
`POSVOJI_EXPECTED_SHA`. It never pulls Git or upgrades dependencies. A process
lock prevents overlapping crawl jobs; publication reuses the existing host
deployment lock. Exit 0 and the documented degraded exit 2 can publish. Other
export exits stop the run. A failed provider retains its prior observations.

Each completed provider writes a content-addressed snapshot before the next
publication stages. A retry can resume clean checkpoints younger than two hours
that are newer than the last materialized dataset, and only with identical code
and provider policy. Normal scheduled runs still discover listings. Empty
results are checkpointed only after the removal guard accepts them. Resuming or
carrying data never advances its real source-check time.

`crawl-manifest.json` binds provider snapshot references and their check times,
policy and overrides hashes, code SHA, and a durable input authority/sequence.
`generation.json` seals this manifest, both datasets, the other generated JSON
and referenced media bytes. Legacy six-artifact receipts remain readable.
Deployments compare the input sequence and observation times under the host
lock before media mutation and again before flipping the live symlink. A newer
published generation cannot be overwritten by an older candidate. Restore or
migration must preserve the input authority, never initialize a competing one.

Every new release contains `_posvoji/status.json`, with its release/generation
identity, code SHA, provider check times and homepage digest. It contains no
credentials or shelter content. The post-flip HTTPS check requires HTTP 200 and
the exact expected status and homepage bytes. A 401 is a failure. A failed flip
attempts the existing rollback transaction; rollback is only reported verified
after checking the old homepage and, when present, its status. Ambiguous results
retain the host lock for inspection. This verifies delivery, not every route.

## Supervised handover

1. Restore SSH access. Inspect the server firewall and SSH listener from the
   console; retain the restriction to the maintainer's current address.
2. Review and commit the intended code and its required deployment helpers.
   This working tree also contains unrelated UI edits; do not commit or promote
   them implicitly. Run all repository checks before choosing the commit.
3. Install the repository's Node version and pinned pnpm, plus Python 3.12+,
   Git, curl, flock and the existing portal runtime. Prepare the checkout at
   `/srv/posvoji/app`, owned by `posvoji:caddy`. Install frozen dependencies as
   that user. Warm the pnpm store used by the service; local deployment installs
   the hermetic build's dependencies with `--offline`. Test sharp on this host.
4. Pause the Windows crawl task once it is idle. Under the artifact lock, seed
   the host with a verified generation, `image-cache.json`, all referenced media,
   `crawl-state.json`, `provider-snapshots/`, and `input-revision.json` if present.
   Do not copy a partial generation or the source machine's lock directory.
   Keep the previous PC state available until the handover is verified.
5. Prepare private `/etc/posvoji/crawl.env` and `backup.env` using the examples in
   `scripts/systemd`. Set the real commit and existing database path. Configure
   both the portal export URL and token together, or neither before integration
   is launched. Files must be readable by the service user and not public.
   If basic auth remains enabled, create `/etc/posvoji/health.netrc`, owned by
   the service user, mode 600, containing credentials for `posvoji.si` only.
6. Verify ownership of `/srv/posvoji`, existing releases/media and lock parents
   permits the `posvoji` service to deploy. Run `scripts/install-host-runner.sh`
   as root. It verifies and installs units but deliberately does not start them.
7. Run `systemctl start posvoji-crawl.service` under supervision. Inspect its
   journal, duration, resource usage, generation and public HTTPS verification.
   Record the measured build time. If it fails, fix that before switching timers.
8. Run `systemctl start posvoji-backup.service`; retrieve and restore-check an
   archive on the PC as below. Then enable the two host timers with
   `systemctl enable --now posvoji-crawl.timer posvoji-backup.timer`. Confirm the
   next two crawl times with `systemctl list-timers`. Disable the old Windows
   crawl and dead-man tasks only after the host and external monitor are proven.

Before activation fails, the fallback is the existing PC publisher. After the
host starts creating revisions, never resume the old PC state without seeding
it from the host and stopping the host publisher first.

For a sealed export that failed only during publication, run
`bash scripts/run-host-crawl.sh --retry-publish` as the service user. It verifies
the saved generation and publishes without another crawl. For applying current
policy/portal changes to saved crawl data, use `--republish`. This still performs
a full Next build and may need missing media; it is not a five-minute guarantee.

## External monitoring without a new account

`.github/workflows/production-health.yml` checks the production status and
homepage at minutes 17 and 47. It verifies their identity and fails when any
provider check is unknown, future-dated or older than 30 hours. Legacy releases
without provider metadata use the dataset timestamp. It retries the pair once
to tolerate a release switch between the two reads.

After deploying the status endpoint, set repository variable
`POSVOJI_MONITOR_ENABLED=true`, run the workflow manually and confirm a green
result. While basic auth is enabled, store its netrc content in Actions secret
`POSVOJI_MONITOR_NETRC`; never put it in a variable, workflow, log or commit.
Verify the maintainer receives failed-workflow notifications using a controlled
failure before relying on it. The workflow is explicitly gated to public
repositories to avoid paid private-repository runner usage.

This is external polling, not an immediate per-run heartbeat. A failed publish
can remain below the freshness threshold until the next check, and GitHub can
delay scheduled runs or disable schedules after repository inactivity. Review
the monitor periodically. Healthchecks integration can be added if an account
is later chosen; none is required or claimed active here.

## Backups using existing PC storage

No Hetzner VM backups or paid storage are required by these scripts. Backups
still matter: the portal database and its corrections cannot be reconstructed
by crawling. The PC copy protects against loss of the server disk; its age
depends on the PC being online and logged in. Production does not wait for it.

The daily host job creates a private archive at `/srv/posvoji/backups` using
SQLite's online backup API and integrity check. It captures the sealed dataset,
referenced image files and cache manifest under the artifact lock, plus input
revision and provider progress. It retains three complete host archives. These
host archives are transfer staging, not protection against server loss. The
portal's uploaded listing photos are included by setting `PORTAL_MEDIA_ROOT`
in `backup.env`. Database and files are copied independently; immutable upload
names are expected, and a restore must check that referenced photos exist.

On the PC, install restic from its official distribution, then run:

```powershell
./scripts/pull-backup.ps1 -Initialize
./scripts/setup-backup-task.ps1
```

The first command creates an encrypted repository under
`%USERPROFILE%/posvoji-backups`, with a separately protected password file at
`%USERPROFILE%/.posvoji-backup-password`. Keep a recovery copy of that password
in an existing password manager. The second command registers a hidden daily
and logon retrieval task. Retrieval checks the transferred archive's SHA-256,
checks the encrypted repository and retains 7 daily, 4 weekly and 6 monthly
snapshots. Disk space is still finite; inspect usage and `last-success.json`.
No task or usable off-server backup exists merely because these scripts exist.

For a restore drill, use restic to restore the latest `posvoji-production`
snapshot to a new private directory, extract `posvoji.tar` there with Python's
safe `tarfile` data filter, and check `portal.sqlite3` with
`PRAGMA integrity_check`. Verify `generation/dist` and `generation/media` with
`validateGenerationReceipt` from the saved code version. Check the raw crawl,
image cache and input authority/sequence are present before calling the drill
successful. Keep drill files private and remove them after verification.

For a real restore, stop writers, restore the database to its configured path
and restore generation/state/media into the installed checkout. Preserve the
latest production input authority and advance the sequence beyond any known
published sequence before writing new generations. An old backup may contain
withdrawn content: apply current provider permissions before publishing. Restore
does not authorize bringing withdrawn records, images or old releases online.

## Permission withdrawal and deferred portal work

After recording withdrawal in `policy.yaml`, promote that policy change and run
an immediate `dataset:export --republish`, then `scripts/deploy.sh --withdrawal`
(`--local` on the host), using the normal locks. This removes the provider from
the merged dataset and media allowlist, and reduces release retention to one.
Withdrawal pruning failures are reported as failures even if the new page is
live. Verify old animal/media URLs and old release directories are gone; review
private checkpoint and backup retention against the withdrawal request too.
This is an operator procedure, not an automatic policy-change watcher.

The availability overlay and portal worker are deferred until SMTP, shelter
login and the public-launch decision are resolved. The crawl export credentials
are configured privately on the host. A
minimal availability-only overlay can avoid a full build for corrections, but
its publication acknowledgement must include the overlay revision and be proven
against the served dataset. No correction latency or working portal access is
promised by this deployment work. The requested freshness UI redesign is out
of scope; source check metadata here is for operational correctness.
