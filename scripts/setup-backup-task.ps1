[CmdletBinding()]
param(
  [string]$ScriptPath = (Join-Path $PSScriptRoot 'pull-backup.ps1'),
  [string]$BackupRoot = (Join-Path $env:USERPROFILE 'posvoji-backups')
)
$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath $ScriptPath -PathType Leaf)) { throw 'Backup pull script is missing' }
if ($ScriptPath.Contains('"') -or $BackupRoot.Contains('"')) { throw 'Paths must not contain quotes' }
$identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$action = New-ScheduledTaskAction -Execute (Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe') -Argument "-NoProfile -NonInteractive -WindowStyle Hidden -File `"$ScriptPath`" -BackupRoot `"$BackupRoot`""
$triggers = @((New-ScheduledTaskTrigger -Daily -At '12:30'), (New-ScheduledTaskTrigger -AtLogOn -User $identity))
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 2)
$principal = New-ScheduledTaskPrincipal -UserId $identity -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName 'PosvojiBackupPull' -TaskPath '\Posvoji\' -Action $action -Trigger $triggers -Settings $settings -Principal $principal -Force | Out-Null
Write-Output 'Daily backup retrieval registered. The PC must be online and logged in; production does not depend on this task.'
