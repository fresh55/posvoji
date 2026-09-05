function Assert-BackupFreshness {
  param([object]$Receipt, [double]$MaxAgeHours = 36, [DateTimeOffset]$Now = [DateTimeOffset]::UtcNow)
  $created = [DateTimeOffset]::MinValue
  if ($null -eq $Receipt.PSObject.Properties['createdAt'] -or
      -not [DateTimeOffset]::TryParse([string]$Receipt.createdAt, [ref]$created)) {
    throw 'Host backup has no valid creation time; prepare a new backup first'
  }
  if ($MaxAgeHours -le 0 -or $created -gt $Now.AddMinutes(5) -or ($Now - $created).TotalHours -gt $MaxAgeHours) {
    throw 'Host backup is stale or future-dated; retrieval is not a successful backup'
  }
}
