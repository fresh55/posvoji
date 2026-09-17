<# Registers only the notification source. Does not change scheduled tasks. #>
[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$source = 'PosvojiCrawl'
$sourceKey = "HKLM:\SYSTEM\CurrentControlSet\Services\EventLog\Application\$source"
if (Test-Path -LiteralPath $sourceKey) {
  Write-Output "Event source $source is already registered."
  return
}
$identity = [Security.Principal.WindowsPrincipal]::new(
  [Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $identity.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw 'Run this script once in Windows PowerShell as administrator. No scheduled tasks will be changed.'
}
New-EventLog -LogName Application -Source $source
Write-Output "Registered $source in the Application log. Scheduled tasks were not changed."
