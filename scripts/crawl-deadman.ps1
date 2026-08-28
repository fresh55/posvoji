<#
.SYNOPSIS
  Warn when the scheduled crawl has stopped running.

.DESCRIPTION
  The crawl task reports its own failures. It cannot report the failure of
  not running at all: a task that was disabled, a clone that was deleted, a
  trigger that got lost in a Windows update. Nothing would say a word, and
  the site would serve last month's animals.

  So this reads the one artifact every successful run rewrites, the dataset at
  data/dist/animals.json, and warns if it is missing or older than the
  threshold. The crawl runs every 12 hours, so 30 hours is two missed runs
  plus room for a long export. A PC that was switched off overnight has not
  missed anything it will not catch up on, which is why the threshold is not
  tighter.

  Registered by setup-crawl-task.ps1 as PosvojiCrawlDeadman, on logon and
  again at midday.

.EXAMPLE
  powershell.exe -NoProfile -File crawl-deadman.ps1 -CloneDir C:\...\posvoji-crawl
#>
[CmdletBinding()]
param(
  [string]$CloneDir = 'C:\Users\bruno\source\repos\posvoji-crawl',

  # Two missed runs plus slack. See above.
  [int]$MaxAgeHours = 30
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Continue'

$dataset = Join-Path $CloneDir 'data\dist\animals.json'

# Prefer the notifier next to this script, since the two ship together. The
# CloneDir copy is the fallback for a deadman run from somewhere else.
$notifier = Join-Path $PSScriptRoot 'crawl-notify.ps1'
if (-not (Test-Path -LiteralPath $notifier)) {
  $notifier = Join-Path $CloneDir 'scripts\crawl-notify.ps1'
}

function Send-Warning {
  param([string]$Message)

  Write-Output "deadman: $Message"

  if (-not (Test-Path -LiteralPath $notifier)) {
    Write-Error "deadman: no crawl-notify.ps1 at $notifier, cannot raise a toast"
    return
  }

  & $notifier -Level Warning -Title 'Scheduled crawl looks stopped' -Message $Message
}

if (-not (Test-Path -LiteralPath $dataset)) {
  Send-Warning ("No dataset at $dataset. The scheduled crawl has never " +
    "completed, or the clone is gone. Check the PosvojiCrawlDeploy task.")
  exit 1
}

$age = (Get-Date) - (Get-Item -LiteralPath $dataset).LastWriteTime
$ageHours = [math]::Round($age.TotalHours, 1)

if ($age.TotalHours -gt $MaxAgeHours) {
  Send-Warning ("The dataset is $ageHours hours old, over the $MaxAgeHours " +
    "hour threshold. The crawl has missed at least two runs. Check the " +
    "PosvojiCrawlDeploy task and the newest run log.")
  exit 1
}

# The quiet path, which is almost every run. Written to stdout so a manual
# invocation says something, and Task Scheduler discards it otherwise.
Write-Output "deadman: dataset is $ageHours hours old, under the $MaxAgeHours hour threshold"
exit 0
