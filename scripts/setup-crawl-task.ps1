<#
.SYNOPSIS
  Install the scheduled crawl on this PC: a dedicated clone plus two
  Windows scheduled tasks.

.DESCRIPTION
  Run once, by hand, by whoever owns the machine. Idempotent: running it
  again re-registers the tasks against the current settings and leaves an
  existing clone and its data alone.

  What it sets up:

    PosvojiCrawlDeploy    every 12 hours, runs scripts/scheduled-crawl.sh
                          under Git Bash. Updates the clone, exports the
                          dataset, and deploys when the export says the
                          result is worth deploying.

    PosvojiCrawlDeadman   at logon and again at midday, runs
                          scripts/crawl-deadman.ps1, which warns when the
                          dataset has gone stale because the crawl stopped
                          running at all.

  Both tasks run with an interactive token, so they only run while the user
  is logged on and no password is stored anywhere. Everything else about
  them is in docs/CRAWL-SCHEDULING.md.

  schtasks.exe is deliberately not used: it cannot set StartWhenAvailable or
  WakeToRun, which are the two settings that make a 12 hour schedule survive
  a sleeping desktop.

.PARAMETER CloneDir
  Where the deployment clone lives. Created if missing.

.PARAMETER SeedDataDir
  Optional path to an existing data/dist to copy in, so the first scheduled
  run has a previous dataset to diff against and carry records from. Refused
  if the target already has content.

.PARAMETER SeedMediaDir
  Optional path to an existing apps/web/public/media to copy in, so the first
  deploy does not have to re-fetch 270 MB of shelter photos. Refused if the
  target already has content.

.PARAMETER StartAt
  First run. Defaults to the next top of the hour; every run after that is
  12 hours later.

.PARAMETER DryRun
  Print every step without cloning, copying, installing or registering
  anything.

.EXAMPLE
  .\setup-crawl-task.ps1 -DryRun

.EXAMPLE
  .\setup-crawl-task.ps1 `
    -SeedDataDir C:\Users\bruno\source\repos\posvoji.si\data\dist `
    -SeedMediaDir C:\Users\bruno\source\repos\posvoji.si\apps\web\public\media
#>
[CmdletBinding()]
param(
  [string]$CloneDir = 'C:\Users\bruno\source\repos\posvoji-crawl',
  [string]$RepoUrl = 'https://github.com/fresh55/posvoji.git',
  [string]$SeedDataDir = '',
  [string]$SeedMediaDir = '',
  [datetime]$StartAt = ([datetime]::Now.Date.AddHours([datetime]::Now.Hour + 1)),
  [switch]$DryRun
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

# --- constants ---------------------------------------------------------------

# Absolute, never the bare name. `bash` on this machine resolves to WSL,
# which has no access to the Windows clone and none of the toolchain.
$GitBash = 'C:\Program Files\Git\bin\bash.exe'
$PowerShellExe = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'

$TaskPath = '\Posvoji\'
$CrawlTaskName = 'PosvojiCrawlDeploy'
$DeadmanTaskName = 'PosvojiCrawlDeadman'
$EventSource = 'PosvojiCrawl'

$CrawlIntervalHours = 12
$CrawlTimeLimitHours = 6
$DeadmanMaxAgeHours = 30

$UserId = "$env:USERDOMAIN\$env:USERNAME"

# --- output ------------------------------------------------------------------

function Write-Stage { param([string]$Text) Write-Host ''; Write-Host "=== $Text ===" }
function Write-Info { param([string]$Text) Write-Host "  $Text" }
function Write-Would { param([string]$Text) Write-Host "  [dry-run] $Text" }

function Stop-Setup {
  param([string]$Text)
  Write-Host ''
  Write-Host "setup: $Text" -ForegroundColor Red
  exit 1
}

# C:\a\b becomes /c/a/b, which is what Git Bash wants and what the task's
# action passes to bash -lc.
function ConvertTo-BashPath {
  param([string]$Path)
  $full = [System.IO.Path]::GetFullPath($Path)
  $drive = $full.Substring(0, 1).ToLower()
  $rest = $full.Substring(2).Replace('\', '/')
  return "/$drive$rest"
}

function Test-DirectoryHasContent {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) { return $false }
  return @(Get-ChildItem -LiteralPath $Path -Force -ErrorAction SilentlyContinue).Count -gt 0
}

function Test-Elevated {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal $identity
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

# --- stage 1: preflight ------------------------------------------------------

Write-Stage 'Preflight'

if ($DryRun) { Write-Info 'dry run: nothing will be cloned, copied or registered' }

if (-not (Test-Path -LiteralPath $GitBash)) {
  Stop-Setup ("no Git Bash at $GitBash. Install Git for Windows, or edit " +
    '$GitBash in this script and in scripts/scheduled-crawl.sh. Do not ' +
    "substitute a bare 'bash', which is WSL here and cannot run this pipeline.")
}
Write-Info "git bash: $GitBash"

if (-not (Test-Path -LiteralPath $PowerShellExe)) {
  Stop-Setup "no Windows PowerShell at $PowerShellExe"
}
Write-Info "powershell: $PowerShellExe"

foreach ($tool in @('git', 'pnpm', 'node')) {
  $found = Get-Command $tool -ErrorAction SilentlyContinue
  if (-not $found) { Stop-Setup "$tool is not on PATH" }
  Write-Info "$($tool): $($found.Source)"
}

if (-not (Get-Command Register-ScheduledTask -ErrorAction SilentlyContinue)) {
  Stop-Setup 'the ScheduledTasks module is not available on this machine'
}

Write-Info "task user: $UserId (interactive token, no stored password)"
Write-Info "first run: $($StartAt.ToString('yyyy-MM-dd HH:mm')), then every $CrawlIntervalHours hours"

# --- stage 2: the clone ------------------------------------------------------

Write-Stage 'Clone'

if (Test-Path -LiteralPath (Join-Path $CloneDir '.git')) {
  Write-Info "$CloneDir is already a clone, leaving it and its data alone"
}
elseif (Test-DirectoryHasContent $CloneDir) {
  Stop-Setup ("$CloneDir exists, has content and is not a git clone. Move it " +
    'aside or pass a different -CloneDir.')
}
elseif ($DryRun) {
  Write-Would "git clone --branch main $RepoUrl `"$CloneDir`""
}
else {
  Write-Info "cloning $RepoUrl into $CloneDir"
  & git clone --branch main $RepoUrl $CloneDir
  if ($LASTEXITCODE -ne 0) { Stop-Setup "git clone failed with $LASTEXITCODE" }
}

# --- stage 3: seed the gitignored state --------------------------------------

Write-Stage 'Seed'

# data/dist and apps/web/public/media are gitignored build state, so a fresh
# clone has neither. Seeding is optional: without it the first run crawls
# everything from scratch and re-fetches every photo, which works and takes
# hours. Never overwrites: a non-empty target means somebody already has
# state here, and silently replacing it would throw away a dataset that
# firstSeenAt dates depend on.
function Copy-Seed {
  param([string]$Source, [string]$Target, [string]$Label)

  if ([string]::IsNullOrWhiteSpace($Source)) {
    Write-Info "$($Label): no seed given, the first run will build it from scratch"
    return
  }
  if (-not (Test-Path -LiteralPath $Source)) {
    Stop-Setup "$Label seed $Source does not exist"
  }
  if (Test-DirectoryHasContent $Target) {
    Stop-Setup ("$Label target $Target already has content. Refusing to " +
      'overwrite it. Delete it by hand first if that is really what you want.')
  }
  if ($DryRun) {
    Write-Would "robocopy `"$Source`" `"$Target`" /E  ($Label)"
    return
  }

  Write-Info "copying $Label from $Source"
  & robocopy $Source $Target /E /NFL /NDL /NJH /NJS /NP | Out-Null
  # robocopy uses exit codes as a bit field: under 8 is success of some kind,
  # 8 and up is a real failure. It is the one CLI where 1 means "copied".
  if ($LASTEXITCODE -ge 8) { Stop-Setup "robocopy failed with $LASTEXITCODE" }
  Write-Info "$($Label): copied"
}

Copy-Seed -Source $SeedDataDir -Target (Join-Path $CloneDir 'data\dist') -Label 'dataset'
Copy-Seed -Source $SeedMediaDir -Target (Join-Path $CloneDir 'apps\web\public\media') -Label 'media'

# --- stage 4: install --------------------------------------------------------

Write-Stage 'Install'

if ($DryRun) {
  Write-Would "pnpm install --frozen-lockfile in $CloneDir"
}
elseif (-not (Test-Path -LiteralPath (Join-Path $CloneDir 'package.json'))) {
  Stop-Setup "no package.json in $CloneDir, the clone looks incomplete"
}
else {
  Push-Location $CloneDir
  try {
    & pnpm install --frozen-lockfile
    if ($LASTEXITCODE -ne 0) { Stop-Setup "pnpm install failed with $LASTEXITCODE" }
  }
  finally { Pop-Location }
}

# --- stage 5: the event log source -------------------------------------------

Write-Stage 'Event log'

# Writing to the Application log under our own source needs the source
# registered under HKLM, which needs one elevated run. Without it the tasks
# still toast and still write their run logs; only the durable event-log
# record is missing, and crawl-notify.ps1 says so when it cannot write one.
$sourceExists = $false
try { $sourceExists = [System.Diagnostics.EventLog]::SourceExists($EventSource) } catch { }

if ($sourceExists) {
  Write-Info "event source $EventSource is registered"
}
elseif ($DryRun) {
  Write-Would "New-EventLog -LogName Application -Source $EventSource (needs elevation)"
}
elseif (Test-Elevated) {
  New-EventLog -LogName Application -Source $EventSource
  Write-Info "registered event source $EventSource"
}
else {
  Write-Info "event source $EventSource is not registered and this shell is not elevated."
  Write-Info 'Toasts and run logs work without it. To get the event log too, run once as admin:'
  Write-Info "  New-EventLog -LogName Application -Source $EventSource"
}

# --- stage 6: the tasks ------------------------------------------------------

Write-Stage 'Scheduled tasks'

# A -Once trigger with a repetition is how you get "every N hours forever"
# out of this module. -RepetitionDuration [TimeSpan]::MaxValue is the
# documented way to say "no end", and some builds reject it, so there is a
# ten year fallback that outlives this machine.
function New-RepeatingTrigger {
  param([datetime]$At, [int]$IntervalHours)

  $interval = New-TimeSpan -Hours $IntervalHours
  try {
    return New-ScheduledTaskTrigger -Once -At $At `
      -RepetitionInterval $interval -RepetitionDuration ([TimeSpan]::MaxValue)
  }
  catch {
    Write-Info 'RepetitionDuration [TimeSpan]::MaxValue was rejected here, using 3650 days'
    return New-ScheduledTaskTrigger -Once -At $At `
      -RepetitionInterval $interval -RepetitionDuration (New-TimeSpan -Days 3650)
  }
}

function Register-CrawlTask {
  param(
    [string]$Name,
    $Action,
    $Trigger,
    $Settings,
    $Principal,
    [string]$Description
  )

  $existing = $null
  try {
    $existing = Get-ScheduledTask -TaskName $Name -TaskPath $TaskPath -ErrorAction Stop
  }
  catch { }

  if ($existing) {
    if ($DryRun) {
      Write-Would "Unregister-ScheduledTask -TaskName $Name -TaskPath $TaskPath -Confirm:`$false"
    }
    else {
      Unregister-ScheduledTask -TaskName $Name -TaskPath $TaskPath -Confirm:$false
      Write-Info "unregistered the existing $Name"
    }
  }

  if ($DryRun) {
    Write-Would "Register-ScheduledTask -TaskName $Name -TaskPath $TaskPath ``"
    Write-Would "  -Action (Execute '$($Action.Execute)'"
    Write-Would "           Arguments $($Action.Arguments))"
    Write-Would "  -Principal (UserId $UserId, LogonType Interactive, RunLevel Limited)"
    return
  }

  Register-ScheduledTask -TaskName $Name -TaskPath $TaskPath `
    -Action $Action -Trigger $Trigger -Settings $Settings -Principal $Principal `
    -Description $Description | Out-Null
  Write-Info "registered $TaskPath$Name"
}

# Run only while this user is logged on, with a normal token and no stored
# password. A crawl that has to wait for a logon is a crawl that runs a few
# hours late; a stored password on a home desktop is a permanent liability.
$principal = New-ScheduledTaskPrincipal -UserId $UserId -LogonType Interactive -RunLevel Limited

# --- the crawl task ---

$runnerBashPath = ConvertTo-BashPath (Join-Path $CloneDir 'scripts\scheduled-crawl.sh')
# Quoted twice on purpose: the outer pair keeps Windows argument splitting
# from breaking a path with a space in it, the inner pair does the same for
# bash's own word splitting inside -lc.
$crawlArgument = "-lc `"'$runnerBashPath'`""

$crawlAction = New-ScheduledTaskAction -Execute $GitBash `
  -Argument $crawlArgument -WorkingDirectory $CloneDir

$crawlTrigger = New-RepeatingTrigger -At $StartAt -IntervalHours $CrawlIntervalHours

# StartWhenAvailable runs a missed occurrence once the machine is back, so a
# desktop that slept through 03:00 crawls when it wakes instead of skipping
# to 15:00. WakeToRun wakes it rather than waiting. IgnoreNew is the single
# instance guard: a run that overruns its 12 hours is never joined by a
# second one.
$crawlSettings = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -WakeToRun `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit (New-TimeSpan -Hours $CrawlTimeLimitHours) `
  -MultipleInstances IgnoreNew

Register-CrawlTask -Name $CrawlTaskName -Action $crawlAction -Trigger $crawlTrigger `
  -Settings $crawlSettings -Principal $principal `
  -Description "Crawl the Slovenian shelters every $CrawlIntervalHours hours and deploy posvoji.si when the dataset is worth deploying."

# --- the dead man's switch ---

$deadmanScript = Join-Path $CloneDir 'scripts\crawl-deadman.ps1'
$deadmanArgument = "-NoProfile -NonInteractive -ExecutionPolicy Bypass " +
"-File `"$deadmanScript`" -CloneDir `"$CloneDir`" -MaxAgeHours $DeadmanMaxAgeHours"

$deadmanAction = New-ScheduledTaskAction -Execute $PowerShellExe `
  -Argument $deadmanArgument -WorkingDirectory $CloneDir

# On logon, because that is when somebody is there to read a toast, and again
# at midday so a machine left on for a week still gets asked. The delay keeps
# it out of the logon stampede.
$deadmanLogon = New-ScheduledTaskTrigger -AtLogOn -User $UserId
$deadmanLogon.Delay = 'PT3M'
$deadmanDaily = New-ScheduledTaskTrigger -Daily -At ([datetime]::Today.AddHours(12))

$deadmanSettings = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 5) `
  -MultipleInstances IgnoreNew

Register-CrawlTask -Name $DeadmanTaskName -Action $deadmanAction `
  -Trigger @($deadmanLogon, $deadmanDaily) `
  -Settings $deadmanSettings -Principal $principal `
  -Description "Warn when $CloneDir\data\dist\animals.json is more than $DeadmanMaxAgeHours hours old, which means the crawl has stopped running."

# --- summary -----------------------------------------------------------------

Write-Stage 'Summary'

Write-Info "clone:    $CloneDir"
Write-Info "logs:     $CloneDir-logs\run-YYYYMMDD-HHMMSS.log"
Write-Info "crawl:    $TaskPath$CrawlTaskName, every $CrawlIntervalHours hours from $($StartAt.ToString('yyyy-MM-dd HH:mm'))"
Write-Info "deadman:  $TaskPath$DeadmanTaskName, at logon and 12:00 daily"
Write-Host ''
Write-Info 'Run one now:'
Write-Info "  Start-ScheduledTask -TaskName $CrawlTaskName -TaskPath $TaskPath"
Write-Info 'Watch it:'
Write-Info "  Get-Content (Get-ChildItem '$CloneDir-logs\run-*.log' | Sort-Object LastWriteTime | Select-Object -Last 1).FullName -Wait"
Write-Info 'Pause it:'
Write-Info "  Disable-ScheduledTask -TaskName $CrawlTaskName -TaskPath $TaskPath"
Write-Host ''
Write-Info 'Details: docs/CRAWL-SCHEDULING.md'
Write-Host ''
