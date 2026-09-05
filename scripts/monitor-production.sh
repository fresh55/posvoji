#!/usr/bin/env bash
# This checks only our own published site. Never crawls shelter websites.
set -euo pipefail
script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
scratch=$(mktemp -d)
trap 'rm -f -- "$scratch/status.json" "$scratch/index.html"; rmdir -- "$scratch"' EXIT
args=(--disable --fail --silent --show-error --compressed --proto '=https' --connect-timeout 10 --max-time 30 --max-filesize 16777216 --header 'Cache-Control: no-cache')
if [[ -n "${POSVOJI_MONITOR_NETRC_FILE:-}" ]]; then
  [[ -f "$POSVOJI_MONITOR_NETRC_FILE" && ! -L "$POSVOJI_MONITOR_NETRC_FILE" && $(stat -c '%a' "$POSVOJI_MONITOR_NETRC_FILE") = 600 ]] || { echo 'monitor credentials must be a mode-600 regular file' >&2; exit 1; }
  args+=(--netrc-file "$POSVOJI_MONITOR_NETRC_FILE")
fi
fetch() {
  local status
  status=$(curl "${args[@]}" --output "$2" --write-out '%{http_code}' "$1") || return 1
  [[ "$status" = 200 ]] || { echo "unexpected HTTP status: $status" >&2; return 1; }
}
check() {
  fetch https://posvoji.si/_posvoji/status.json "$scratch/status.json" &&
  fetch https://posvoji.si/ "$scratch/index.html" &&
  node "$script_dir/release-status.mjs" fresh "$scratch/status.json" "${POSVOJI_MAX_SOURCE_AGE_HOURS:-30}" "$scratch/index.html"
}
# A release can switch between the two reads. Retry the pair once; sustained
# HTTP, identity or freshness failures still fail the workflow.
check || check
echo 'production content and source freshness: OK'
