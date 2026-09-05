# Crawl scheduling

The host-runner implementation and its activation checklist are now in
[PRODUCTION-OPERATIONS.md](PRODUCTION-OPERATIONS.md). It includes verified
release delivery, provider checkpoints, free external monitoring and encrypted
PC backups. The Windows scheduler described below remains active until that
checklist's supervised handover succeeds; adding unit files does not migrate it.

The dataset behind posvoji.si is a crawl artifact, so the site is only as
current as the last export. This is how that export is made to happen on its
own, twice a day, without anybody remembering to do it.

Today it runs on the maintainer's Windows PC. That is a stopgap and it is
written down as one: [Later: move it to the
host](#later-move-it-to-the-host) is the plan it gets replaced by, and the
constraints section says which of today's problems that fixes.

## What runs, and when

Two Windows scheduled tasks, both registered by
[`scripts/setup-crawl-task.ps1`](../scripts/setup-crawl-task.ps1) under the
task folder `\Posvoji\`.

| Task | Trigger | Runs |
|---|---|---|
| `PosvojiCrawlDeploy` | once, then every 12 hours for 10 years (reinstall renews it) | `scripts/scheduled-crawl.sh` under Git Bash |
| `PosvojiCrawlDeadman` | at logon (3 min delay) and 12:00 daily | `scripts/crawl-deadman.ps1` |

Neither task stores a password. Both run with an interactive token, which
means they run only while the maintainer is logged on. That is a deliberate
trade: a missed run costs a few hours of staleness, and a stored password on
a home desktop is permanent.

The crawl task is set `StartWhenAvailable` and `WakeToRun`, so a PC that was
asleep at 03:00 wakes for the run, and a PC that was switched off runs the
missed occurrence once it comes back rather than waiting for the next slot.
`MultipleInstances IgnoreNew` is the single-instance guard: a run that
overruns is never joined by a second one. The execution time limit is 10
hours: a cold image-cache and derivative pass can legitimately take about
seven, while ten still stops a wedged run two hours before the next scheduled
occurrence. The separate keep-awake helper gives up after 10 hours 15 minutes,
so even Task Scheduler's hard termination cannot leave the machine held awake
indefinitely through an abandoned flag.

Changing the setup script does not edit an already registered task. After an
update to these settings, rerun `scripts/setup-crawl-task.ps1`; its idempotent
registration is what replaces the old execution limit on the machine.

### What one run does

Everything below is [`scripts/scheduled-crawl.sh`](../scripts/scheduled-crawl.sh),
running out of a dedicated clone at `C:\Users\bruno\source\repos\posvoji-crawl`.
That clone exists so a crawl never runs against a working copy somebody is
editing, and so a deploy is always of committed code.

1. **Pin the environment.** Task Scheduler hands a task the environment as it
   was cached at logon, and that copy can be stale or wrong (KB 2968540). The
   script sets `HOME`, `USERPROFILE`, `APPDATA`, `LOCALAPPDATA` and the temp
   directory itself, and prepends the absolute locations of Node, the npm
   global bin where pnpm lives, Git's own binaries and System32 to `PATH`.
   `HOME` matters more than it looks: `deploy.sh` finds the SSH key under it,
   and the portal's credentials are read from `$HOME/.posvoji-crawl.env` when
   that file exists. It sits beside the clone rather than in it because step 3
   resets the clone to `origin/main`, so a token committed here would be
   destroyed on the next run and published on the first. Two keys go in it:

   ```sh
   PORTAL_EXPORT_URL=https://api.posvoji.si
   PORTAL_EXPORT_TOKEN=<the value of PORTAL_EXPORT_TOKEN in the portal's env>
   ```

   Both are optional. Without them ingest skips the override and listing
   feeds, so a machine with no portal configured still has a crawl to do; the
   shelters that write their own listings simply carry forward.
2. **Wait for a network.** Up to 150 seconds of retry delay, plus bounded
   ping attempts, checking 1.1.1.1 and 8.8.8.8.
   A machine that just woke for this run usually has a link within a few
   seconds; DHCP and a VPN can take longer. The log says which one answered.
3. **Update the clone.** `git fetch --prune`, `git reset --hard origin/main`,
   `git clean -fd`. The clean has no `-x`, permanently: `data/dist` and
   `apps/web/public/media` are gitignored build state that this pipeline
   produces and the deploy reads, and `-x` would delete both, plus
   `node_modules`, on every run.
4. **Install.** `pnpm install --frozen-lockfile`.
5. **Export.** `pnpm --filter @posvoji/ingest export`, and then the gate
   below on its exit code.
6. **Deploy.** `scripts/deploy.sh`, which does its own hermetic build of
   `apps/web` at HEAD in a throwaway worktree, syncs media, ships a release
   and flips the symlink. See [DEPLOY-MEDIA.md](DEPLOY-MEDIA.md).

The script rewrites itself in step 3, since it lives in the clone it is
updating. Its body is inside a function called from a brace group that ends
in `exit`, which makes bash parse the whole file into memory before the first
git command touches the disk. A new version of the runner therefore takes
effect on the *next* run, not halfway through this one.

## The exit-code contract

This is the part worth understanding, because it decides whether a run
deploys. It is defined in
[`apps/ingest/src/exit-codes.ts`](../apps/ingest/src/exit-codes.ts) and read
by the runner.

| Code | Means | The runner |
|---|---|---|
| `0` | Clean. Every enabled provider crawled, the dataset was written. | deploys |
| `2` | Degraded. A provider failed, its previous records were carried forward, the dataset was written and is safe to ship. | warns, then deploys |
| anything else | Blocked. Nothing was written, or what was written must not ship. | aborts before the deploy |

`2` exists because the alternative is worse. One shelter's website being
down, or its robots.txt refusing us for an afternoon, used to make the whole
run non-zero and indistinguishable from a guard trip. Shipping ten shelters
that crawled plus one that is a few hours stale is better than shipping
nothing at all and leaving every shelter a day stale.

`1` is every throw in the pipeline: invalid provider policies, a mass-removal
guard trip, an animal whose shelter id and provider id disagree, an unreadable
previous dataset, two previous datasets from different runs. Node exits `1` on
an uncaught throw by itself, so nothing in the exporter has to set it. These
are the cases where the dataset either does not exist or should not be
believed, and deploying either one would push a broken site over a working
one.

One kind of run has no `2` at all: the run that bootstraps
`data/dist/animals.crawled.json` with the portal integration on, which is a
`--refresh-all` over every provider done by hand. `2` means a provider's
previous records were carried forward, and on that one run they would come
from the merged dataset and be written into the new snapshot as if the crawl
had said them. So it checks after the crawl that every enabled provider
finished and refreshed in full, and exits `1` before writing anything if not.
See `apps/ingest/src/crawled-snapshot.ts`.

When the export is blocked, the site keeps serving the previous release. The
deploy checks a new release before an atomic link replacement, and its remote
flip transaction restores the previous target when the post-flip health check
fails. A connection loss exactly at the transaction's commit boundary can make
the caller's result uncertain, so a deploy-failure notification asks the
operator to inspect `/srv/posvoji/current` rather than claiming which release
is live.

## Logs

`C:\Users\bruno\source\repos\posvoji-crawl-logs\run-YYYYMMDD-HHMMSS.log`, one
file per run, holding everything the run and its children printed. The
directory sits beside the clone rather than inside it, so it never shows up in
`git status` and needs no gitignore entry that exists for one machine's
benefit. Logs older than 30 days are deleted at the start of every run.

Task Scheduler discards a task's stdout, so these files are the only copy.

```powershell
# the newest run, followed live
Get-Content (Get-ChildItem 'C:\Users\bruno\source\repos\posvoji-crawl-logs\run-*.log' |
  Sort-Object LastWriteTime | Select-Object -Last 1).FullName -Wait
```

## Toasts, and what they mean

An unattended run that fails silently is a run nobody fixes, so
[`scripts/crawl-notify.ps1`](../scripts/crawl-notify.ps1) raises a Windows
toast and writes an Application event-log record under the source
`PosvojiCrawl`.

| Toast | Level | Event id | What happened |
|---|---|---|---|
| Crawl deployed | information | 102 | Normal. A clean run shipped. |
| Degraded crawl deployed | information | 102 | Shipped, but a shelter carried its previous records forward. |
| Crawl degraded, deploying anyway | warning | 101 | The export exited 2. The deploy is proceeding. |
| Crawl could not start | error | 100 | No network, or git, or the install failed. Nothing was crawled or deployed. |
| Crawl failed, nothing deployed | error | 100 | The export was blocked. The site still serves the previous release. |
| Deploy failed | error | 100 | The dataset is fine, shipping it is not. The flip normally restored the previous release; verify `current` because a commit-boundary connection loss is ambiguous. |
| Scheduled crawl looks stopped | warning | 101 | From the dead man's switch, below. |

Failure notifications include the run log when one is available. Success
toasts are intentionally brief, and the separate dead-man's-switch toast points
at the stale dataset instead.

There is no toast module involved. The script uses raw WinRT with the AUMID
Windows already registers for Windows PowerShell, which is what lets it show
a toast without a packaged and signed app identity.

Writing to the Application log under our own source needs that source
registered under `HKLM`, which needs one elevated run:

```powershell
New-EventLog -LogName Application -Source PosvojiCrawl
```

`setup-crawl-task.ps1` does this when it is run elevated and prints the line
above when it is not. Without it, toasts and run logs still work and only the
durable record is missing; `crawl-notify.ps1` says so in the run log rather
than failing.

```powershell
# every record the pipeline has written
Get-EventLog -LogName Application -Source PosvojiCrawl -Newest 20
```

## The dead man's switch

The crawl task reports its own failures. It cannot report the failure of not
running at all: a task somebody disabled and forgot, a clone that was
deleted, a trigger lost in a Windows update. Nothing would say a word and the
site would quietly serve last month's animals.

`PosvojiCrawlDeadman` runs [`scripts/crawl-deadman.ps1`](../scripts/crawl-deadman.ps1)
at logon and again at midday. It reads the modification time of
`data/dist/animals.json`, the one file every successful run rewrites, and
warns if it is missing or more than **30 hours** old. Thirty is two missed
12 hour runs plus room for a long export, which means a PC that was off
overnight does not trip it for something it will catch up on by itself.

It reads the file's timestamp directly. The crawl writes no separate heartbeat
for it, because a heartbeat that a broken run can still write is not a
heartbeat.

## Operating it

```powershell
# force a run now
Start-ScheduledTask -TaskName PosvojiCrawlDeploy -TaskPath \Posvoji\

# is it running, and how did the last one end
Get-ScheduledTask -TaskPath \Posvoji\ | Get-ScheduledTaskInfo |
  Format-List TaskName, LastRunTime, LastTaskResult, NextRunTime

# pause and resume
Disable-ScheduledTask -TaskName PosvojiCrawlDeploy -TaskPath \Posvoji\
Enable-ScheduledTask  -TaskName PosvojiCrawlDeploy -TaskPath \Posvoji\

# check the dead man's switch by hand
.\scripts\crawl-deadman.ps1 -CloneDir C:\Users\bruno\source\repos\posvoji-crawl
```

`LastTaskResult` of `0` means the runner fully completed. Any nonzero value (or
a Task Scheduler launch code rather than a shell exit code) requires the run
log and `/srv/posvoji/current` to determine how far it got.

Pause it before touching production by hand, and before any change to
`deploy.sh` that has not been dry-run. Deploys themselves are serialized by the
host-wide `.deploy-lock`, but a hand migration or server edit is not safe until
it either holds that same lock or the scheduled task has stopped.

### Installing or reinstalling

```powershell
# see everything it would do, touch nothing
.\scripts\setup-crawl-task.ps1 -DryRun

# for real, seeding the clone from an existing working copy so the first run
# does not have to re-fetch 270 MB of photos
.\scripts\setup-crawl-task.ps1 `
  -SeedDataDir  C:\Users\bruno\source\repos\posvoji.si\data\dist `
  -SeedMediaDir C:\Users\bruno\source\repos\posvoji.si\apps\web\public\media
```

The script is idempotent: it re-registers both tasks and leaves an existing
clone and its data alone. Seeding never overwrites a non-empty target; it
refuses instead, because a dataset carries the `firstSeenAt` dates that
cannot be recovered once they are gone.

## Known constraints

**A sleeping or powered-off PC misses runs, and that is safe.** The trigger is
`StartWhenAvailable`, so the missed occurrence runs once the machine is back
rather than being skipped. Two runs a day means the worst case for a machine
that was off all weekend is one catch-up run on Monday. Nothing accumulates and
nothing double-deploys.

**Nobody logged on means no run at all.** Interactive logon type, by choice.
The dead man's switch is what catches a stretch of this.

**A run holds the machine awake, but only against the idle timer.**
`WakeToRun` gets the PC up for the run and does nothing to keep it up, and a
crawl spends half an hour waiting on shelter servers with the CPU near idle,
which is what an unused machine looks like. The first real run, on 29 August
2026, was lost that way eleven minutes in. `scripts/crawl-keepawake.ps1` now
holds `ES_SYSTEM_REQUIRED` for as long as the run's flag file exists, so the
idle timer cannot suspend a crawl. Manually sleeping the PC suspends and later
resumes it; shutdown or forced termination interrupts it and may leave partial
generated files, which the export/deploy consistency guards reject before
publication. It may also leave `.artifact-lock` because Task Scheduler's hard
termination does not guarantee that the process receives a cleanup signal.
The next ingest or deploy recovers that lock only when its structured owner
record names this hostname, stable machine identity and exact checkout, and
the recorded process birth identity is proved gone. PID reuse is distinguished
on Windows rather than treated as the old job. Locks copied from another
checkout or machine, legacy owner files and unreadable identity/liveness checks
stay fail-closed. For one of those cases, first
verify in Task Manager that no `scheduled-crawl.sh`, ingest Node process or
`deploy.sh` for this clone is running, then move `.artifact-lock` aside for
inspection; do not delete it merely because it is old. Released and recovered
locks are retained beside it as ignored `.artifact-lock.retired-<nonce>`
evidence and ABA guards; they do not block later runs. The next complete run
replaces partial artifacts.

**A changed home IP address breaks the deploy at the first ssh.** The host
only accepts SSH from the maintainer's home address, so when the ISP hands out
a new one, `deploy.sh` fails in the deploy stage with a `BatchMode=yes`
connection timeout. The dataset export will have succeeded; only the shipping
fails, and the toast says so. The fix is on the host, in its `ufw` rule for
port 22: replace the old address with the new one and re-run the crawl task.
This constraint disappears entirely when the job moves to the host, since a
job running on the host does not SSH into it.

**The deploy needs the dataset and the media to be present locally.**
`deploy.sh` refuses to run if `data/dist/animals.json`,
`animals.crawled.json`, `image-cache.json`, `overrides.json`, `share-cards.json`,
`shelter-logos.json`, the last-written `generation.json` receipt or the media
root is missing, or if any receipt-named media byte does not match. An empty
referenced-media set is valid. The setup script can seed this generated state;
without it and with the portal integration off, a first run crawls and
re-fetches everything, which takes hours. With the portal integration on, seed
first or run a supervised full `pnpm dataset:export --refresh-all` so the
crawled baseline exists. Under release layout v2 that already-required crawled
dataset is also copied into the release's private half; see "Release layout" in
[DEPLOY-MEDIA.md](DEPLOY-MEDIA.md). Until the host's marker file exists, an
unattended deploy ships today's layout, withholds the private artifacts and
points to the authoritative migration runbook. Pause
this task for those three steps, as for any hand change to production; the
runbook also holds the host deploy lock across the docroot and marker changes
so neither a scheduled nor manual release can land between them.

**One scheduled clone, one machine.** The runner hard-resets its clone on every
run, so do not point the task at a directory anybody edits. A working copy may
deploy separately because the host lock serializes host mutations, but its
local build inputs and the scheduled clone remain independent.

## Later: move it to the host

The dev PC is the wrong machine for this. It sleeps, it needs somebody logged
on, and it has to be let through a firewall to deploy to a server that could
have done the whole job locally. The plan is a systemd timer on the Hetzner
box.

**What it becomes.** A `posvoji-crawl.timer` with
`OnCalendar=00,12:00:00 UTC` and `Persistent=true`, so a host that was down
runs one catch-up rather than one per missed slot, plus
`RandomizedDelaySec=15min` so the shelters are not all hit at exactly the same
minute of the hour by a job that never forgets. The service is
`Type=oneshot` with an explicit `TimeoutStartSec=10h`: the same bound as the
desktop task, long enough for a cold seven-hour image pass but still short of
the next 12-hour occurrence. A oneshot with no timeout can hang forever holding
the timer's next run. An `OnFailure=` alert unit makes a timeout or other
failure reach a person the way the toast does now.

**Confinement.** Run as the existing `posvoji` account (the deployed tree is
owned `posvoji:caddy`), with `ProtectSystem=strict` and
`ReadWritePaths=/srv/posvoji` so the crawl can write the dataset and media but
not arbitrary system paths. `DynamicUser=yes` is not compatible with those
existing Unix ownership and mode requirements. `MemoryMax=` and `CPUQuota=`
are not optional on that box: the image pipeline is the heaviest thing that
will ever run there and Caddy is
serving the site from the same two cores. A crawl that starves the web server
has failed at its purpose.

**What has to change first.** `deploy.sh` currently hardcodes `REMOTE_HOST`
and `SSH_KEY` and assumes it is shipping *to* somewhere. Before this move it
needs those two env-overridable, and a local mode that skips the SSH and the
tar streaming and instead builds straight into `releases/` and flips the
symlink in place. That local mode is most of the work; the unit files are the
easy half.

**What it retires.** Both Windows tasks, this document's first half, the
dependency on somebody being logged on, and the `ufw` home-IP pin, which
exists only so this PC can reach port 22.
