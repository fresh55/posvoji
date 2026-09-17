$ErrorActionPreference = 'Stop'
$notifier = Join-Path $PSScriptRoot 'crawl-notify.ps1'
$global:posvojiTestRecorded = $null
function Write-EventLog {
  param($LogName, $Source, $EntryType, $EventId, $Message, $ErrorAction)
  $global:posvojiTestRecorded = "$LogName|$Source|$EntryType|$EventId|$Message"
}
$output = @(& $notifier -NoToast -Level Warning -Title 'Fixture title' -Message 'Fixture body' 3>&1)
if ($LASTEXITCODE -ne 0 -or $output.Count -ne 0 -or
    $global:posvojiTestRecorded -notlike 'Application|PosvojiCrawl|Warning|101|Fixture title*Fixture body') {
  throw 'Registered event source should receive the notification without a warning'
}
function Write-EventLog { throw 'Fixture: source missing or write denied' }
$output = @(& $notifier -NoToast -Title 'Fixture title' -Message 'Fixture body' 3>&1)
if ($LASTEXITCODE -ne 0 -or $output.Count -ne 1 -or
    $output[0] -isnot [System.Management.Automation.WarningRecord] -or
    "$($output[0])" -notmatch 'setup-crawl-event-source.ps1') {
  throw 'An event-log failure must remain a single actionable warning with exit zero'
}
Write-Output 'crawl notification: OK'
