# Production crawl operations

The host runs an installed commit reachable from `origin/main`. The current pin
belongs in private `/etc/posvoji/crawl.env`, not this runbook. Historical rollout
measurements are in [the handover log](operations/2026-09-06-crawl-handover.md).

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
2. Review, test and merge the intended code. Promote the resulting full main
   commit, including the new SHA created by a squash merge.
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

## Promoting installed code

Run `sudo posvoji-promote FULL_MAIN_COMMIT_SHA` after checks and merge. The
installer places this command outside the checkout so a checkout cannot replace
a running script. It fetches `origin/main`, rejects a dirty checkout or a target
outside main history, pauses active timers, and refuses to interrupt an active
job. It holds the crawl and artifact locks while installing frozen dependencies,
updating units and atomically updating only the private commit pin. Failure
restores the old checkout, dependencies and configuration; failed rollback leaves
timers paused and reports that explicitly. Timers never pull or promote code.

After promotion, start `posvoji-crawl.service` under supervision and verify its
journal, served release and operations status. A code promotion itself does not
publish a release. Build temporary files use `/srv/posvoji/tmp`, on the same disk
as the checkout and media, including with systemd `PrivateTmp` enabled.

For a sealed export that failed only during publication, run
`bash scripts/run-host-crawl.sh --retry-publish` as the service user. It verifies
the saved generation and publishes without another crawl. For applying current
policy/portal changes to saved crawl data, use `--republish`. This still performs
a full Next build and may need missing media; it is not a five-minute guarantee.

## External monitoring without a new account

`.github/workflows/production-health.yml` checks production every ten minutes,
away from the hour boundary. It verifies the status/homepage identity and fails when the dataset is more
than 30 hours old. Individual shelter check times that are unknown or old produce
separate warnings; they do not label the whole pipeline broken.

Crawl and backup units use `ExecStartPre` and `ExecStopPost` to record bounded
status fields in `/srv/posvoji/operations/status.json`. Systemd passes the job
result even after a failed start, timeout or OOM kill. A degraded export still
publishes, then records `degraded` rather than silently becoming clean. No logs,
credentials, database content or machine paths go into this status document.

Serve just this file from the existing authenticated site, before its fallback:

```caddyfile
handle /_posvoji/operations.json {
    root * /srv/posvoji/operations
    rewrite * /status.json
    file_server
}
```

The deploy layout check permits `/srv/posvoji/operations` as an additional root.
Pass `--allow-root /srv/posvoji/operations` when running that check manually too.

The monitor fails on a failed host job, missing outcome, overlong running job, or
no recent successful crawl/backup (30/36 hours). A dead host backup is therefore
detected even while the website stays fresh. A recorded failure is visible on
the next monitor run, rather than waiting for the dataset freshness threshold.
Run both services once when installing status reporting; missing history fails
closed. The monitor checks host backup preparation, not whether the PC is online.

Set repository variable `POSVOJI_MONITOR_ENABLED=true`. While basic auth remains,
store its netrc in Actions secret `POSVOJI_MONITOR_NETRC`, never a variable or
commit. Confirm both a manual and a scheduled run execute the verification job.
The public-repository gate compares the serialized boolean to `false`; missing
payload metadata cannot pass by coercion. The first step validates the actual
event payload and logs only its event name and public-repository verdict.

GitHub checks are external; HTTPS checks initiated on the production host are
not independent monitoring. GitHub can delay schedules or disable them after
inactivity. Failed-workflow notifications depend on the maintainer's GitHub
notification preferences; successful polling does not prove notification
receipt. This setup needs no new monitoring account or SMTP credentials.

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
snapshots. Archives include a creation time; retrieval rejects missing, future
or older-than-36-hour receipts before transferring anything. Disk space is still finite; inspect usage and `last-success.json`.
For another installation, no task or usable off-server backup exists merely
because these scripts exist; verify retrieval and restoration there too.

For a restore drill, use `restic ls latest --json` to find the saved archive
path, then `restic dump latest ARCHIVE_PATH` to write its decrypted bytes to a
new private directory. Use binary-safe output redirection (for example Python's
`subprocess.run(..., stdout=binary_file, check=True)`). This avoids restoring
Windows ancestor-directory ACLs and timestamps along with the single archive.
Check the archive SHA-256 against `last-success.json`, then extract it with Python's
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
private backup retention against the withdrawal request too. Every export,
including `--republish`, removes checkpoints for non-granted or removed providers.
Granted providers keep three recent snapshots plus latest and any receipt-bound
reference needed by the current generation.
This is an operator procedure, not an automatic policy-change watcher.

Retired artifact-lock directories are safety tombstones, not ordinary temporary
files. Age alone cannot prove a paused retire/recovery process is gone. The host
prunes only same-machine retirements older than a day and older than the current
boot, checking their nonce, checkout identity and file types. Current-boot
retirements remain small but accumulate until a later reboot; do not delete them
on an age-only schedule.

The availability overlay and portal worker are deferred until SMTP, shelter
login and the public-launch decision are resolved. The crawl export credentials
are configured privately on the host. A
minimal availability-only overlay can avoid a full build for corrections, but
its publication acknowledgement must include the overlay revision and be proven
against the served dataset. No correction latency or working portal access is
promised by this deployment work. The requested freshness UI redesign is out
of scope; source check metadata here is for operational correctness.
