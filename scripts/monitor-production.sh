#!/usr/bin/env bash
# This checks only our own published site. Never crawls shelter websites.
set -euo pipefail
script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
scratch=$(mktemp -d)
trap 'rm -f -- "$scratch/status.json" "$scratch/index.html" "$scratch/operations.json" "$scratch/headers" "$scratch/not-found.html"; rmdir -- "$scratch"' EXIT
args=(--disable --fail --silent --show-error --compressed --proto '=https' --connect-timeout 10 --max-time 30 --max-filesize 16777216 --header 'Cache-Control: no-cache')
if [[ -n "${POSVOJI_MONITOR_NETRC_FILE:-}" ]]; then
  [[ -f "$POSVOJI_MONITOR_NETRC_FILE" && ! -L "$POSVOJI_MONITOR_NETRC_FILE" && $(stat -c '%a' "$POSVOJI_MONITOR_NETRC_FILE") = 600 ]] || { echo 'monitor credentials must be a mode-600 regular file' >&2; exit 1; }
  args+=(--netrc-file "$POSVOJI_MONITOR_NETRC_FILE")
fi
# The branded-404 check at the end reads the body, which --fail throws away, so
# it gets its own argument list. Behind the launch basic_auth gate every path
# answers 401 instead, and its status check names that the way the others do.
not_found_args=()
for arg in "${args[@]}"; do [[ "$arg" = --fail ]] || not_found_args+=("$arg"); done
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
# A browser always sends Accept-Encoding, so a server that stopped compressing
# looks exactly like one that did not and nothing else here would notice. See
# docs/DEPLOY-HEADERS.md for what the site costs uncompressed.
encoded() {
  local status
  status=$(curl "${args[@]}" --output "$2" --dump-header "$scratch/headers" --write-out '%{http_code}' "$1") || return 1
  [[ "$status" = 200 ]] || { echo "unexpected HTTP status: $status" >&2; return 1; }
  grep -qi '^content-encoding:' "$scratch/headers" || { echo "no Content-Encoding for $1" >&2; return 1; }
}
# Chunk names are content-hashed per release, so the chunk to ask for is read
# from the homepage just fetched rather than pinned here. head closes the pipe,
# so the value and not the pipeline's status is what says whether one was found.
delivery() {
  local chunk
  encoded https://posvoji.si/ "$scratch/index.html" || return 1
  chunk=$(grep -o '/_next/static/[^"]*\.js' "$scratch/index.html" | head -n 1) || true
  [[ -n "$chunk" ]] || { echo 'the homepage links no /_next/static chunk' >&2; return 1; }
  encoded "https://posvoji.si$chunk" /dev/null
}
# The same release switch as above takes the hashed chunk with it. Retry once.
delivery || delivery
# out/404.html only reaches a visitor if the server is wired to serve it
# (docs/DEPLOY-HEADERS.md). Assert the status and the page's own words, so the
# server and the export cannot drift apart unnoticed.
status=$(curl "${not_found_args[@]}" --output "$scratch/not-found.html" --write-out '%{http_code}' https://posvoji.si/ni-take-strani)
[[ "$status" = 404 ]] || { echo "unexpected HTTP status for a missing path: $status" >&2; exit 1; }
grep -q 'Stran ne obstaja' "$scratch/not-found.html" || { echo 'a missing path did not serve the branded 404' >&2; exit 1; }
fetch https://posvoji.si/_posvoji/operations.json "$scratch/operations.json"
node "$script_dir/release-status.mjs" operations "$scratch/operations.json"
echo 'production delivery, compression, the 404, pipeline freshness and host jobs: OK'
