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
export npm_config_store_dir=${POSVOJI_PNPM_STORE:-/srv/posvoji/.local/share/pnpm/store}
export TMPDIR=${TMPDIR:-/srv/posvoji/tmp}
cd "$repo"
[[ -n "${POSVOJI_EXPECTED_SHA:-}" && $(git rev-parse HEAD) = "$POSVOJI_EXPECTED_SHA" ]] || { echo 'installed code does not match the promoted commit' >&2; exit 1; }
[[ -z $(git status --porcelain) ]] || { echo 'installed checkout is dirty' >&2; exit 1; }
[[ -d node_modules ]] || { echo 'install pinned dependencies before enabling the timer' >&2; exit 1; }
exec 9>/srv/posvoji/.crawl-run.lock
flock -n 9 || { echo 'another scheduled run is active' >&2; exit 1; }
# Manual retries report the same outcomes as the systemd path. The unit's
# ExecStopPost remains the backstop for kills and failures before this point.
if [[ -z ${INVOCATION_ID:-} ]]; then
  python3 scripts/operations-status.py crawl start
  report_manual_result() {
    local result=$?
    trap - EXIT
    local outcome=exit-code
    [[ $result != 0 ]] || outcome=success
    SERVICE_RESULT=$outcome python3 scripts/operations-status.py crawl finish || result=1
    exit "$result"
  }
  trap report_manual_result EXIT
fi
node scripts/prune-retired-locks.mjs "$repo/.artifact-lock"
case "${1:-}" in
  --retry-publish) : ;; # deploy verifies the sealed snapshot before building
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
if [[ ${export_status:-0} = 2 ]]; then
  python3 scripts/operations-status.py crawl degraded
fi
echo 'scheduled publication verified'
