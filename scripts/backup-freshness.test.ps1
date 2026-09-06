$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'backup-freshness.ps1')
$now = [DateTimeOffset]'2026-09-06T12:00:00Z'
Assert-BackupFreshness -Receipt ([pscustomobject]@{ createdAt = '2026-09-06T05:00:00Z' }) -Now $now
$originalCulture = [Threading.Thread]::CurrentThread.CurrentCulture
try {
  [Threading.Thread]::CurrentThread.CurrentCulture = [Globalization.CultureInfo]'sl-SI'
  Assert-BackupFreshness -Receipt ([pscustomobject]@{ createdAt = [DateTime]'2026-09-06T05:00:00Z' }) -Now $now
  Assert-BackupFreshness -Receipt ('{"createdAt":"2026-09-06T05:00:00+00:00"}' | ConvertFrom-Json) -Now $now
} finally { [Threading.Thread]::CurrentThread.CurrentCulture = $originalCulture }
foreach ($receipt in @([pscustomobject]@{}, [pscustomobject]@{ createdAt = '2026-09-01T05:00:00Z' }, [pscustomobject]@{ createdAt = '2026-09-07T05:00:00Z' })) {
  $failed = $false
  try { Assert-BackupFreshness -Receipt $receipt -Now $now } catch { $failed = $true }
  if (-not $failed) { throw 'Expected missing, stale or future backup to be rejected' }
}
Write-Output 'backup freshness: OK'
