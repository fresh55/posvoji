<#
.SYNOPSIS
  Surface one scheduled-crawl outcome: a desktop toast and an Application
  event-log record.

.DESCRIPTION
  The scheduled crawl runs unattended, so a failure that only appears in a log
  file is a failure nobody sees. This writes both:

  - a toast, because it is the only thing that interrupts somebody;
  - an Application event-log entry under the source PosvojiCrawl, because a
    toast is gone in seconds and a postmortem needs a record.

  There is no toast module here on purpose. Raw WinRT is used with the AUMID
  Windows already registers for Windows PowerShell, which is what lets a
  script show a toast without shipping and signing an app identity.

  Nothing in this script is allowed to fail a run. Every path that can throw
  is caught and reported on stderr, which the runner has redirected into the
  run log.

.EXAMPLE
  powershell.exe -NoProfile -File crawl-notify.ps1 -Level Error `
    -Title "Crawl failed" -Message "The export exited 1. Nothing deployed."
#>
[CmdletBinding()]
param(
  [ValidateSet('Error', 'Warning', 'Information')]
  [string]$Level = 'Information',

  [Parameter(Mandatory = $true)]
  [string]$Title,

  [Parameter(Mandatory = $true)]
  [string]$Message,

  # The event log record without the toast, or the other way round. Used by
  # nothing today; here so a caller that already toasted can still log.
  [switch]$NoToast,
  [switch]$NoEvent
)

Set-StrictMode -Version 2.0

# Notifying about a failure must not become a second failure.
$ErrorActionPreference = 'Continue'

$EventSource = 'PosvojiCrawl'

# One id per level, so an operator can filter the Application log on the id
# alone. eventcreate only accepts 1 to 1000.
$EventIds = @{
  'Error'       = 100
  'Warning'     = 101
  'Information' = 102
}

# The AUMID Windows ships for Windows PowerShell. A toast notifier needs an
# application identity that is already registered with the shell; borrowing
# this one is what keeps the script free of a packaged app and a module.
$AppId = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\WindowsPowerShell\v1.0\powershell.exe'

function Show-CrawlToast {
  param([string]$Level, [string]$Title, [string]$Message)

  try {
    [void][Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime]
    [void][Windows.UI.Notifications.ToastNotification, Windows.UI.Notifications, ContentType = WindowsRuntime]
    [void][Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom, ContentType = WindowsRuntime]
  }
  catch {
    Write-Error "toast: WinRT is not available here: $($_.Exception.Message)"
    return
  }

  # The text is ours but it carries provider names and error messages from a
  # crawl, so it is escaped rather than trusted to contain no angle brackets.
  $safeTitle = [System.Security.SecurityElement]::Escape($Title)
  $safeMessage = [System.Security.SecurityElement]::Escape($Message)

  # duration="long" only matters for the two levels somebody has to act on.
  $duration = if ($Level -eq 'Information') { 'short' } else { 'long' }

  $xml = @"
<toast duration="$duration">
  <visual>
    <binding template="ToastGeneric">
      <text>$safeTitle</text>
      <text>$safeMessage</text>
      <text placement="attribution">Posvoji.si scheduled crawl</text>
    </binding>
  </visual>
</toast>
"@

  try {
    $doc = New-Object Windows.Data.Xml.Dom.XmlDocument
    $doc.LoadXml($xml)
    $toast = New-Object Windows.UI.Notifications.ToastNotification $doc
    [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($AppId).Show($toast)
  }
  catch {
    # A task running while nobody is logged on has no session to toast into.
    # That is a known limitation, not a bug worth failing over.
    Write-Error "toast: could not show the notification: $($_.Exception.Message)"
  }
}

function Write-CrawlEvent {
  param([string]$Level, [string]$Title, [string]$Message)

  $id = $EventIds[$Level]
  $body = "$Title`r`n`r`n$Message"

  # Write-EventLog first because it works as a normal user once the source
  # exists. It is setup-crawl-task.ps1 that creates the source, since doing so
  # writes under HKLM and needs an elevated run.
  try {
    Write-EventLog -LogName Application -Source $EventSource -EntryType $Level `
      -EventId $id -Message $body -ErrorAction Stop
    return
  }
  catch {
    # Falls through to eventcreate, which registers the source itself when it
    # is run elevated.
  }

  $eventType = $Level.ToUpper()
  & eventcreate.exe /T $eventType /ID $id /L APPLICATION /SO $EventSource /D $body 2>&1 |
    Out-Null
  if ($LASTEXITCODE -ne 0) {
    Write-Error ("event log: could not record this run. The event source " +
      "$EventSource is not registered and eventcreate needs elevation to " +
      "create it. Run setup-crawl-task.ps1 from an elevated prompt once.")
  }
}

if (-not $NoToast) { Show-CrawlToast -Level $Level -Title $Title -Message $Message }
if (-not $NoEvent) { Write-CrawlEvent -Level $Level -Title $Title -Message $Message }

# Always. The caller decides the run's exit code, not the notifier.
exit 0
