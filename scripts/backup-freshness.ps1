function Assert-BackupFreshness {
  param([object]$Receipt, [double]$MaxAgeHours = 36, [DateTimeOffset]$Now = [DateTimeOffset]::UtcNow)
  $created = [DateTimeOffset]::MinValue
  if ($null -eq $Receipt.PSObject.Properties['createdAt']) {
    throw 'Host backup has no valid creation time; prepare a new backup first'
  }
  # PowerShell 7 can deserialize JSON timestamps into DateTime automatically.
  # Stringifying that value and parsing it again can swap month/day in sl-SI.
  if ($Receipt.createdAt -is [DateTimeOffset] -or $Receipt.createdAt -is [DateTime]) {
    $created = [DateTimeOffset]$Receipt.createdAt
  } elseif (-not [DateTimeOffset]::TryParse([string]$Receipt.createdAt, [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::None, [ref]$created)) {
    throw 'Host backup has no valid creation time; prepare a new backup first'
  }
  if ($MaxAgeHours -le 0 -or $created -gt $Now.AddMinutes(5) -or ($Now - $created).TotalHours -gt $MaxAgeHours) {
    throw 'Host backup is stale or future-dated; retrieval is not a successful backup'
  }
}
