# Production crawl operations

The host runs an installed commit reachable from `origin/main`. The current pin
belongs in private `/etc/posvoji/crawl.env`, not this runbook.

## Operating contract

After promotion and unit installation, the timer checks providers hourly at
minute 07 Europe/Ljubljana, with up to 15 minutes of jitter. `crawl.intervalHours`
is a minimum between attempts/checks; current 12-hour policies normally produce
two source crawls per day. An hourly pass can publish portal corrections and
carried observations without claiming another source check. It still performs
a site build: measure this host cost. Start times drift with prior attempts,
service duration and the hourly eligibility pass. The timer catches up after
downtime. The service uses one CPU
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
and provider policy. Due providers discover listings and verify every detail page. Empty
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
   `crawl-state.json`, `crawl-schedule.json`, `host-cooldowns.json`,
   `provider-snapshots/`, and `input-revision.json` if present.
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
   archive on the PC as below. Run and verify `posvoji-health.service` too, then enable the three host timers with
   `systemctl enable --now posvoji-crawl.timer posvoji-backup.timer posvoji-health.timer`. Confirm the
   next eligibility and health checks with `systemctl list-timers`. Disable the old Windows
   crawl and dead-man tasks only after the host and external monitor are proven.

Before activation fails, the fallback is the existing PC publisher. After the
host starts creating revisions, never resume the old PC state without seeding
it from the host and stopping the host publisher first.

## Promoting installed code

For each production-bound merge, finish the rollout in the same work session:
verify CI for the exact merged main SHA, promote that SHA, supervise one crawl
and publication, then verify the served code SHA, source freshness and host job
status. Record the installed and published SHAs. A green merge is not a finished
deployment; if promotion must wait for an active job or a failed check, report
that explicitly rather than describing the fix as live. Batch related fixes
into one tested main promotion when practical. Timers continue using the pinned
commit and do not auto-update code.

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

A promotion can remove a field from the `Animal` schema, as #302 removed
`substantialWhite`. The first export after it drops the field from the previous
datasets as it reads them (`RETIRED_ANIMAL_FIELDS` in
`apps/ingest/src/run-guards.ts`) and writes them without it, keeping every
`firstSeenAt`. No operator step is needed. If an export stops on
`Unrecognized key` for a removed field, add the field to that list. Do not use
`--discard-previous`, which resets every `firstSeenAt`. Do not
`--retry-publish` a generation sealed before such a promotion either: it builds
the saved datasets unchanged, and the site build rejects the removed field. Run
the crawl or `--republish` instead.

## External monitoring without a new account

`.github/workflows/production-health.yml` requests external checks every hour
minutes, but actual September 2026 runs had gaps exceeding five hours. Do not
promise ten-minute external detection. The additional `posvoji-health.timer`
runs the same check on the host every ten minutes; it checks delivery and
freshness without depending on GitHub's schedule. Inspect `systemctl status
posvoji-health.service` and its journal for failures. This is a local check,
not host-loss detection or proof that a human received an alert. The health
unit uses `/etc/posvoji/health.netrc`; remove that unit environment setting
when the site no longer needs authentication.

Health, crawl and backup units use `OnFailure=posvoji-alert@%n.service`.
The alert template reads the portal's existing SMTP settings from
`/srv/posvoji/portal.env` and the recipient from `/etc/posvoji/alerts.env`:

```ini
POSVOJI_ALERT_TO=operator@example.invalid
```

Create that file as root with mode `600`, using the operator's confirmed
address. `install-host-runner.sh` installs the template and its bounded,
standard-library SMTP sender. A portal unit managed separately can use the
same `OnFailure` setting in a systemd drop-in. Notices contain the failed unit
and inspection instructions, never application logs. The alert unit has no
failure hook of its own, so a mail outage cannot recurse into more alerts.
Test the complete route using a deliberate, separate failing unit:

```bash
sudo systemd-run --wait --unit=posvoji-alert-test \
  --property=Type=oneshot \
  --property=OnFailure=posvoji-alert@posvoji-alert-test.service.service /bin/false
sudo systemctl status posvoji-alert@posvoji-alert-test.service.service
sudo systemctl reset-failed posvoji-alert-test.service
```

The first command intentionally fails. Confirm the alert service succeeds and
the test notice reaches the operator before claiming delivery works. The host
still cannot email during a host or network outage; the external check covers
that case independently, subject to GitHub scheduling and SMTP availability.

The monitor fails if the dataset is older than 30 hours, if no provider
observations exist, or if any provider's discovery or oldest detail check is
missing, future-dated or older than its policy interval plus six hours. Legacy
receipts without interval metadata use 30 hours. A fresh publication timestamp
cannot mask stale source content. Degraded publication remains useful, but
source staleness has a separate failing outcome. For a dependable external
alert deadline, use an independently hosted monitor and verify alert delivery;
GitHub's scheduler cannot supply that guarantee. No new paid service is installed.

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

Set repository variable `POSVOJI_MONITOR_ENABLED=true`. This opt-in works for
private and public repositories; private checks consume the account's Actions
allowance. The hourly schedule bounds that usage while host checks remain every
ten minutes. While basic auth remains,
store its netrc in Actions secret `POSVOJI_MONITOR_NETRC`, never a variable or
commit. Confirm both a manual and a scheduled run execute the verification job.
Store `POSVOJI_ALERT_CONFIG` as an Actions **secret** containing a JSON object
with `POSVOJI_ALERT_TO` and the required `PORTAL_EMAIL_*`, `PORTAL_FROM_EMAIL`,
`PORTAL_FROM_NAME` and `PORTAL_REPLY_TO_EMAIL` settings from the private host
configuration. Never put the recipient or SMTP password in a repository file
or variable. Failed checks send a bounded notice linking to the Actions run.
Dispatch once with `test_alert=true` and confirm inbox receipt; the same sender
is covered by offline SMTP tests. Repository visibility is a separate launch
decision and is not changed by enabling monitoring.

GitHub checks are external; HTTPS checks initiated on the production host are
not independent monitoring. GitHub can delay schedules or disable them after
inactivity. Failed-workflow notifications depend on the maintainer's GitHub
notification preferences; successful polling does not prove notification
receipt. The explicit SMTP alert uses the existing portal mail account, so no
new monitoring account or mail provider is needed.

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

## Crawl frequency and rate-limit recovery

`crawl-schedule.json` records an attempt once the crawl of a provider has
settled, on success and on failure alike. A run killed mid-crawl records
nothing, so the next run retries that provider. Normal runs, targeted runs and
`--refresh-all` respect the provider's interval. A clean checkpoint can resume
without requests. Lower-frequency providers retain their previous source
timestamps between due crawls. Permission withdrawal and other publication
restrictions still apply immediately.

A provider the schedule holds back is reported on. One whose last successful
check is inside its interval is named in a single "not due" line and the run
stays clean. One held back by a recorded attempt alone, with its last
successful check older than its interval or with no successful check at all, is
warned about by name, keeps its previous records and makes the run exit 2.

`host-cooldowns.json` preserves valid Retry-After deadlines across restarts,
without a cap. Invalid headers use exponential backoff. A cooldown beyond the
last successful check plus the provider's interval makes the run degraded.
Waits over one minute, including Crawl-delay, defer work. Preserve both state
files in backups. Invalid stored state stops the crawl; repair it from a known
good copy.

Robots requests and redirects share the host's queue and delay. Connection
failures are cached for five minutes per origin, up to 256 entries per client.
Expired or evicted entries require another robots check before fetching content.

Every due crawl checks all details. Failed details keep their previous records
and fetch timestamps. Scheduling, checkpoint resume and media caching still apply.

After upgrading, verify a permitted crawl and its sealed provider timestamps,
then a second run inside the interval: it must preserve source check times.
Check that the health service fails against a deliberately stale offline fixture.
Do not use an old PC snapshot to replace newer production observations.

The September 8–9 crawl incident is not explained by the source audit alone.
Its host journal is required to distinguish export, publication, resource,
permission, and pin/checkout failures. During the September 13 audit, SSH to the
configured host timed out; no new units or crawler code were installed there.
