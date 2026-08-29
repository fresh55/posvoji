<#
.SYNOPSIS
Keeps the machine awake while the scheduled crawl runs.

.DESCRIPTION
WakeToRun gets the PC out of sleep for the 02:00 crawl, but nothing keeps it
out. A crawl is 30 to 45 minutes of waiting on shelter servers with almost no
local work, which reads to Windows as an idle machine, so the unattended idle
timer puts it back to sleep and the run dies mid-fetch with nothing written.
That is exactly how the first real run was lost on 29 August 2026.

This holds ES_SYSTEM_REQUIRED for as long as the flag file exists. The runner
creates the flag before it starts and removes it on the way out, including
when it aborts, so the hold never outlives the run that asked for it. The
MaxMinutes deadline is the second lock: a runner killed so hard it cannot
delete its own flag still gets its hold released.

ES_DISPLAY_REQUIRED is deliberately not set. The screen is free to turn off,
which is what anyone would expect from a job that runs at two in the morning.
A user who deliberately chooses Sleep from the Start menu still gets sleep;
this only stops the idle timer.

.PARAMETER FlagFile
The hold lasts while this path exists.

.PARAMETER MaxMinutes
Safety deadline. Matches the task's own six hour execution limit.
#>
param(
  [Parameter(Mandatory = $true)][string]$FlagFile,
  [int]$MaxMinutes = 360
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$signature = @'
[DllImport("kernel32.dll", SetLastError = true)]
public static extern uint SetThreadExecutionState(uint esFlags);
'@

$power = Add-Type -MemberDefinition $signature -Name 'Power' -Namespace 'Posvoji' -PassThru

# SetThreadExecutionState is per thread and only holds while the thread that
# called it is alive, so this process has to stay up for the whole run. That
# is what the wait loop below is for.
$ES_CONTINUOUS = [uint32]'0x80000000'
$ES_SYSTEM_REQUIRED = [uint32]'0x00000001'

if ($power::SetThreadExecutionState($ES_CONTINUOUS -bor $ES_SYSTEM_REQUIRED) -eq 0) {
  Write-Error 'SetThreadExecutionState refused the request, the run is not protected from sleep'
  exit 1
}

try {
  $deadline = (Get-Date).AddMinutes($MaxMinutes)
  while ((Test-Path -LiteralPath $FlagFile) -and ((Get-Date) -lt $deadline)) {
    Start-Sleep -Seconds 15
  }
}
finally {
  [void]$power::SetThreadExecutionState($ES_CONTINUOUS)
}
