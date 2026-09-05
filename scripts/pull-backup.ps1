<#
.SYNOPSIS
  Retrieve a verified host backup and encrypt it into a local restic repository.
  Uses existing PC disk space. Run while online; production never waits for it.
#>
[CmdletBinding()]
param(
  [string]$BackupRoot = (Join-Path $env:USERPROFILE 'posvoji-backups'),
  [string]$Server = 'root@116.203.202.17',
  [string]$KeyFile = (Join-Path $env:USERPROFILE '.ssh\posvoji_hetzner_recovery'),
  [string]$PasswordFile = (Join-Path $env:USERPROFILE '.posvoji-backup-password'),
  [switch]$Initialize
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
if ($Server -notmatch '^[a-z_][a-z0-9_-]*@[a-zA-Z0-9.-]+$') { throw 'Invalid backup server' }
foreach ($tool in @('ssh', 'scp', 'restic')) {
  if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) { throw "$tool must be installed first" }
}
$resolvedRoot = [IO.Path]::GetFullPath($BackupRoot)
if ($resolvedRoot.TrimEnd('\') -eq [IO.Path]::GetPathRoot($resolvedRoot).TrimEnd('\') -or $resolvedRoot.TrimEnd('\') -eq $env:USERPROFILE.TrimEnd('\')) { throw 'Choose a dedicated backup directory' }
if ((Test-Path -LiteralPath $resolvedRoot) -and ((Get-Item -LiteralPath $resolvedRoot).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Backup root must not be a link' }
New-Item -ItemType Directory -Path $resolvedRoot -Force | Out-Null
$identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
& icacls.exe $resolvedRoot /inheritance:r /grant:r "${identity}:(OI)(CI)F" 'SYSTEM:(OI)(CI)F' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Could not protect the local backup directory' }
$repository = Join-Path $resolvedRoot 'restic'
if ($Initialize) {
  if (-not (Test-Path -LiteralPath $PasswordFile)) {
    $randomBytes = New-Object byte[] 48
    $generator = [Security.Cryptography.RandomNumberGenerator]::Create()
    $generator.GetBytes($randomBytes)
    $generator.Dispose()
    [IO.File]::WriteAllText($PasswordFile, [Convert]::ToBase64String($randomBytes))
    & icacls.exe $PasswordFile /inheritance:r /grant:r "${identity}:F" 'SYSTEM:F' | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Could not protect the backup password' }
  }
  if (-not (Test-Path -LiteralPath (Join-Path $repository 'config'))) {
    & restic --repo $repository --password-file $PasswordFile init
    if ($LASTEXITCODE -ne 0) { throw 'Could not initialize encrypted backup storage' }
  }
}
if (-not (Test-Path -LiteralPath $PasswordFile)) { throw 'Initialize the backup repository first' }
$sshOptions = @('-i', $KeyFile, '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '-o', 'ConnectTimeout=10')
$receiptText = & ssh @sshOptions $Server 'cat /srv/posvoji/backups/latest.json'
if ($LASTEXITCODE -ne 0) { throw 'Could not read the host backup receipt' }
$receipt = ($receiptText -join "`n") | ConvertFrom-Json
if ($receipt.file -notmatch '^backup-[a-f0-9]{32}\.tar$' -or $receipt.sha256 -notmatch '^[a-f0-9]{64}$') { throw 'Invalid host backup receipt' }
$stage = Join-Path $resolvedRoot ('.transfer-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $stage | Out-Null
try {
  $archive = Join-Path $stage 'posvoji.tar'
  & scp @sshOptions "${Server}:/srv/posvoji/backups/$($receipt.file)" $archive
  if ($LASTEXITCODE -ne 0) { throw 'Backup transfer failed' }
  if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $receipt.sha256) { throw 'Backup checksum mismatch' }
  & restic --repo $repository --password-file $PasswordFile backup --tag posvoji --host posvoji-production $archive
  if ($LASTEXITCODE -ne 0) { throw 'Encrypting the backup failed' }
  & restic --repo $repository --password-file $PasswordFile check
  if ($LASTEXITCODE -ne 0) { throw 'Encrypted repository verification failed' }
  & restic --repo $repository --password-file $PasswordFile forget --tag posvoji --host posvoji-production --group-by host,tags --keep-daily 7 --keep-weekly 4 --keep-monthly 6 --prune
  if ($LASTEXITCODE -ne 0) { throw 'Backup retention failed' }
  [IO.File]::WriteAllText((Join-Path $resolvedRoot 'last-success.json'), ($receipt | ConvertTo-Json))
  Write-Output 'Verified off-server backup stored on this PC.'
} finally {
  $resolvedStage = [IO.Path]::GetFullPath($stage)
  if (-not $resolvedStage.StartsWith($resolvedRoot.TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Refusing cleanup outside the backup root' }
  Remove-Item -LiteralPath $resolvedStage -Recurse -Force
}
