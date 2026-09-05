#!/usr/bin/env bash
# Installed code only. Provision dependencies during promotion, never git pull
# in a timer. --retry-publish retries a sealed export without crawling again.
set -euo pipefail
umask 027
config=${POSVOJI_CRAWL_CONFIG:-/etc/posvoji/crawl.env}
[[ -f "$config" && ! -L "$config" ]] || { echo 'crawl configuration is missing' >&2; exit 1; }
set -a
source "$config"
set +a
repo=${POSVOJI_REPO_DIR:-/srv/posvoji/app}
cd "$repo"
[[ -n "${POSVOJI_EXPECTED_SHA:-}" && $(git rev-parse HEAD) = "$POSVOJI_EXPECTED_SHA" ]] || { echo 'installed code does not match the promoted commit' >&2; exit 1; }
[[ -z $(git status --porcelain) ]] || { echo 'installed checkout is dirty' >&2; exit 1; }
[[ -d node_modules ]] || { echo 'install pinned dependencies before enabling the timer' >&2; exit 1; }
exec 9>/srv/posvoji/.crawl-run.lock
flock -n 9 || { echo 'another scheduled run is active' >&2; exit 1; }
case "${1:-}" in
  --retry-publish) pnpm media:verify ;;
  ''|--republish)
    export_status=0
    if [[ "${1:-}" = --republish ]]; then
      pnpm dataset:export --republish || export_status=$?
    else
      pnpm dataset:export || export_status=$?
    fi
    case "$export_status" in
      0) : ;;
      2) echo 'degraded crawl: some source data was carried forward' >&2 ;;
      *) exit "$export_status" ;;
    esac
    ;;
  *) echo 'usage: run-host-crawl.sh [--retry-publish|--republish]' >&2; exit 1 ;;
esac
bash scripts/deploy.sh --local
# This checks the externally served identity as well as the loopback check in
# the rollback transaction. Failure remains a failed run, never a false success.
site=/srv/posvoji/current
[[ ! -f /srv/posvoji/.layout-v2 ]] || site=$site/public
bash scripts/verify-release.sh "$site" https://posvoji.si "${POSVOJI_HEALTH_NETRC:-/etc/posvoji/health.netrc}"
echo 'scheduled publication verified'
