# Crawl scheduling

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
| `PosvojiCrawlDeploy` | once, then every 12 hours, forever | `scripts/scheduled-crawl.sh` under Git Bash |
| `PosvojiCrawlDeadman` | at logon (3 min delay) and 12:00 daily | `scripts/crawl-deadman.ps1` |

Neither task stores a password. Both run with an interactive token, which
means they run only while the maintainer is logged on. That is a deliberate
trade: a missed run costs a few hours of staleness, and a stored password on
a home desktop is permanent.

The crawl task is set `StartWhenAvailable` and `WakeToRun`, so a PC that was
asleep at 03:00 wakes for the run, and a PC that was switched off runs the
missed occurrence once it comes back rather than waiting for the next slot.
`MultipleInstances IgnoreNew` is the single-instance guard: a run that
overruns is never joined by a second one. The execution time limit is 6
hours.

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
2. **Wait for a network.** Up to 150 seconds, pinging 1.1.1.1 and 8.8.8.8.
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

When the export is blocked or the deploy fails, the site keeps serving the
previous release. Nothing is torn down first.

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
| Deploy failed | error | 100 | The dataset is fine, shipping it is not. The site still serves the previous release. |
| Scheduled crawl looks stopped | warning | 101 | From the dead man's switch, below. |

Every toast names the run log to read.

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

`LastTaskResult` is the runner's exit code: `0` deployed, `1` did not.

Pause it before touching production by hand, and before any change to
`deploy.sh` that has not been dry-run. A crawl firing in the middle of a
manual deploy is the one way two release flips can race.

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
idle timer cannot end a crawl. Choosing Sleep or Shut down by hand still ends
it, as it should; that run writes nothing and the next one starts over.

**A changed home IP address breaks the deploy at the first ssh.** The host
only accepts SSH from the maintainer's home address, so when the ISP hands out
a new one, `deploy.sh` fails in the deploy stage with a `BatchMode=yes`
connection timeout. The dataset export will have succeeded; only the shipping
fails, and the toast says so. The fix is on the host, in its `ufw` rule for
port 22: replace the old address with the new one and re-run the crawl task.
This constraint disappears entirely when the job moves to the host, since a
job running on the host does not SSH into it.

**The deploy needs the dataset and the media to be present locally.**
`deploy.sh` refuses to run without `data/dist/animals.json` and a non-empty
`apps/web/public/media/animals`, which is why the setup script can seed both.
A first run against an unseeded clone works but crawls and re-fetches
everything, which takes hours. Once the host is on release layout v2 it also
needs `data/dist/animals.crawled.json`, which every export writes; see
"Release layout" in [DEPLOY-MEDIA.md](DEPLOY-MEDIA.md). Until the host's
marker file exists, an unattended deploy ships today's layout, withholds the
private artifacts and prints the three steps that move the host onto the new
layout. Pause this task for those three steps, as for any hand change to
production: a release shipped in the middle of them has no `public/` of its
own, and the docroot is about to be moved onto that path.

**One clone, one machine.** Nothing coordinates between the scheduled clone
and a working copy. Do not point the task at a directory anybody edits: the
runner hard-resets it on every run.

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
`Type=oneshot` with an explicit `TimeoutStartSec=45min`, since a oneshot with
no timeout can hang forever holding the timer's next run, and an `OnFailure=`
alert unit so a failure reaches a person the way the toast does now.

**Confinement.** `DynamicUser=yes`, `ProtectSystem=strict`, and
`ReadWritePaths=/srv/posvoji` so the crawl can write the dataset and the media
and nothing else. `MemoryMax=` and `CPUQuota=` are not optional on that box:
the image pipeline is the heaviest thing that will ever run there and Caddy is
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
