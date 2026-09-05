#!/usr/bin/env bash
# Verify bytes delivered by Caddy, including during the basic_auth launch gate.
# A legacy rollback target can be proven by its exact index.html bytes. Every
# new release must additionally serve its expected public status document.
set -euo pipefail
root=${1:?expected document root required}
origin=${2:-https://posvoji.si}
netrc=${3:-/etc/posvoji/health.netrc}
mode=${4:-strict}
resolve_to=${5:-}
[[ "$origin" =~ ^https://[a-zA-Z0-9.-]+$ ]] || { echo 'invalid HTTPS origin' >&2; exit 1; }
[[ "$mode" = strict || "$mode" = legacy ]] || exit 1
[[ -s "$root/index.html" ]] || { echo 'expected index is missing' >&2; exit 1; }
args=(--disable --silent --show-error --fail --compressed --proto '=https' --noproxy '*' --connect-timeout 5 --max-time 30 --max-filesize 16777216 --header 'Cache-Control: no-cache')
if [[ -e "$netrc" ]]; then
  [[ -f "$netrc" && ! -L "$netrc" && -r "$netrc" ]] || { echo 'health netrc must be a readable regular file' >&2; exit 1; }
  [[ $(stat -c '%a' "$netrc") = 600 ]] || { echo 'health netrc must have mode 600' >&2; exit 1; }
  args+=(--netrc-file "$netrc")
fi
[[ -z "$resolve_to" ]] || args+=(--resolve "$resolve_to")
scratch=$(mktemp -d)
trap 'rm -f -- "$scratch/body"; rmdir -- "$scratch"' EXIT
fetch_exact() {
  local path=$1 expected=$2 status
  status=$(curl "${args[@]}" --output "$scratch/body" --write-out '%{http_code}' "$origin/$path") || return 1
  [[ "$status" = 200 ]] || { echo "unexpected HTTP status: $status" >&2; return 1; }
  cmp -s "$expected" "$scratch/body" || { echo "production bytes differ for /$path" >&2; return 1; }
}
fetch_exact '' "$root/index.html"
if [[ -s "$root/_posvoji/status.json" ]]; then
  fetch_exact '_posvoji/status.json' "$root/_posvoji/status.json"
elif [[ "$mode" != legacy ]]; then
  echo 'expected release status is missing' >&2; exit 1
fi
echo 'verified production release bytes'
