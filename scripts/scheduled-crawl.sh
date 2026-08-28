#!/usr/bin/env bash
#
# The scheduled crawl and deploy.
#
# Windows Task Scheduler runs this every 12 hours from a dedicated clone at
# C:\Users\bruno\source\repos\posvoji-crawl. It updates that clone to
# origin/main, installs, exports the dataset, decides from the export's exit
# code whether the result is worth shipping, and then hands off to
# scripts/deploy.sh, which does its own hermetic build.
#
# The exit-code gate is the whole point of the script:
#
#   0  clean run          deploy
#   2  degraded run       warn, then deploy. Some shelter did not crawl and
#                         its previous records were carried forward. Shipping
#                         a slightly stale shelter beats shipping nothing.
#   *  blocked or crashed abort before the deploy, loudly
#
# See apps/ingest/src/exit-codes.ts for the contract this reads.
#
# Failures are surfaced as a Windows toast and an Application event-log
# record, because nothing else about this run is in front of a human.
# scripts/crawl-notify.ps1 does both.
#
# Set up by scripts/setup-crawl-task.ps1. Documented in
# docs/CRAWL-SCHEDULING.md.

set -euo pipefail

# --- this machine ------------------------------------------------------------
#
# Task Scheduler hands a task the environment as it was cached when the user
# logged on, and that copy can be stale or incomplete (KB 2968540). Nothing
# below is inherited from it. The paths were read off this PC with
# `where.exe node pnpm` and `where.exe git`; if the box changes, they change
# here.

export HOME="/c/Users/bruno"
export USERPROFILE='C:\Users\bruno'
export APPDATA='C:\Users\bruno\AppData\Roaming'
export LOCALAPPDATA='C:\Users\bruno\AppData\Local'

# deploy.sh calls mktemp -d, and a task with no TMP set gets a directory it
# cannot write to.
export TMPDIR="/c/Users/bruno/AppData/Local/Temp"
export TMP='C:\Users\bruno\AppData\Local\Temp'
export TEMP='C:\Users\bruno\AppData\Local\Temp'

# node.exe, then the npm global bin where pnpm lives, then Git's own binaries
# (tar, ssh, cygpath), then System32 for ping, cmd and powershell. Prepended
# rather than appended: a cached PATH that points at an old Node must not win.
PATH="/c/Program Files/nodejs:/c/Users/bruno/AppData/Roaming/npm:${PATH}"
PATH="/c/Program Files/Git/bin:/c/Program Files/Git/usr/bin:${PATH}"
PATH="${PATH}:/c/Windows/System32:/c/Windows/System32/Wbem"
export PATH

POWERSHELL="/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe"

# How long to wait for a network after a wake. A machine that resumes for a
# 03:00 run has its NIC up seconds later, but DHCP and a VPN can take longer.
NETWORK_WAIT_SECONDS=150
NETWORK_POLL_SECONDS=5

# Run logs older than this are deleted at the start of every run.
LOG_RETENTION_DAYS=30

# --- where things are --------------------------------------------------------

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Beside the clone, not inside it. A log directory inside the checkout would
# either show up in `git status` or need a gitignore entry that only exists
# for the benefit of this one machine.
LOG_DIR="${REPO_ROOT}-logs"

NOTIFY_PS1="${REPO_ROOT}/scripts/crawl-notify.ps1"
DEPLOY_SH="${REPO_ROOT}/scripts/deploy.sh"
DATASET="${REPO_ROOT}/data/dist/animals.json"

# --- helpers -----------------------------------------------------------------

log() {
  printf '%s  %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"
}

# A toast plus an event-log record. Never fails the run: if PowerShell or the
# notifier is missing, the message still reaches the run log through the
# fallback below.
notify() {
  local level="$1" title="$2" message="$3" status=0

  log "notify [${level}] ${title}: ${message}"

  if [ ! -x "${POWERSHELL}" ] || [ ! -f "${NOTIFY_PS1}" ]; then
    log "notify: no powershell.exe or no crawl-notify.ps1, log only"
    return 0
  fi

  "${POWERSHELL}" -NoProfile -NonInteractive -ExecutionPolicy Bypass \
    -File "$(cygpath -w "${NOTIFY_PS1}")" \
    -Level "${level}" \
    -Title "${title}" \
    -Message "${message}" 2>&1 | sed 's/^/  /' || status=$?

  if [ "${status}" -ne 0 ]; then
    log "notify: crawl-notify.ps1 exited ${status}"
  fi
  return 0
}

# Both arguments are logged and toasted, then the run stops. Called for every
# condition that means "do not deploy".
abort() {
  local title="$1" message="$2"
  notify Error "${title}" "${message}"
  log "aborted: ${title}"
  exit 1
}

# The dataset in one line, for the summary. Best effort: a summary is not
# worth failing a successful deploy over.
dataset_summary() {
  node -e '
    const { readFileSync } = require("node:fs");
    const d = JSON.parse(readFileSync(process.argv[1], "utf8"));
    process.stdout.write(d.animals.length + " animals, generated " + d.generatedAt);
  ' "${DATASET}" 2>/dev/null || printf 'dataset summary unavailable'
}

# A machine that woke for this run may not have a network yet, and every
# stage below needs one. Tries both resolvers so a single blackholed address
# does not read as "no internet", and logs which one answered.
wait_for_network() {
  local waited=0 host

  while [ "${waited}" -lt "${NETWORK_WAIT_SECONDS}" ]; do
    for host in 1.1.1.1 8.8.8.8; do
      if ping -n 1 -w 2000 "${host}" >/dev/null 2>&1; then
        log "network: ${host} answered after ${waited}s"
        return 0
      fi
    done
    sleep "${NETWORK_POLL_SECONDS}"
    waited=$((waited + NETWORK_POLL_SECONDS))
  done

  log "network: neither 1.1.1.1 nor 8.8.8.8 answered in ${NETWORK_WAIT_SECONDS}s"
  return 1
}

# --- the run -----------------------------------------------------------------

main() {
  mkdir -p "${LOG_DIR}"
  local log_file="${LOG_DIR}/run-$(date '+%Y%m%d-%H%M%S').log"

  # Everything from here on, this script's output and every child's, lands in
  # the run log and on stdout. Task Scheduler discards stdout, so the file is
  # the only copy that survives.
  exec > >(tee -a "${log_file}") 2>&1

  log "=== scheduled crawl starting ==="
  log "repo:  ${REPO_ROOT}"
  log "log:   ${log_file}"
  log "node:  $(node --version 2>/dev/null || echo 'not found')"
  log "pnpm:  $(pnpm --version 2>/dev/null || echo 'not found')"

  find "${LOG_DIR}" -maxdepth 1 -name 'run-*.log' -mtime "+${LOG_RETENTION_DAYS}" \
    -delete 2>/dev/null || true

  if [ ! -d "${REPO_ROOT}/.git" ]; then
    abort "Crawl could not start" \
      "${REPO_ROOT} is not a git clone. Run setup-crawl-task.ps1 first."
  fi

  if ! wait_for_network; then
    abort "Crawl could not start" \
      "No network after ${NETWORK_WAIT_SECONDS}s. Nothing was crawled or deployed."
  fi

  cd "${REPO_ROOT}"

  # --- update the clone ------------------------------------------------------
  #
  # Hard reset rather than pull: this clone is a deployment artifact, not
  # somebody's working copy, and a merge conflict at 03:00 helps nobody.
  log "--- updating to origin/main ---"

  git fetch --prune origin ||
    abort "Crawl could not start" "git fetch failed. Nothing was deployed."

  git reset --hard origin/main ||
    abort "Crawl could not start" "git reset --hard origin/main failed. Nothing was deployed."

  # No -x, deliberately and permanently. The dataset in data/dist and the
  # 270 MB of cached photos under apps/web/public/media are gitignored build
  # state that this pipeline produces and deploy.sh reads; -x would delete
  # both, along with node_modules, on every run. The two -e patterns are
  # redundant with that, and stay as a second lock on the door.
  git clean -fd -e data/dist -e apps/web/public/media ||
    log "git clean reported a problem, continuing"

  log "now at $(git rev-parse --short=12 HEAD) ($(git log -1 --pretty=%s))"

  # --- install ---------------------------------------------------------------

  log "--- pnpm install --frozen-lockfile ---"
  pnpm install --frozen-lockfile ||
    abort "Crawl could not start" \
      "pnpm install --frozen-lockfile failed. Nothing was crawled or deployed."

  # --- export ----------------------------------------------------------------
  #
  # The gate. set -e must not kill the run here: a nonzero code is data, and
  # the || is what keeps it that way.
  log "--- dataset export ---"
  local export_status=0
  pnpm --filter @posvoji/ingest export || export_status=$?
  log "export exited ${export_status}"

  case "${export_status}" in
    0)
      log "export: clean"
      ;;
    2)
      # Degraded. A provider failed, its previous records were carried
      # forward, and the dataset was written. Worth deploying, worth saying.
      notify Warning "Crawl degraded, deploying anyway" \
        "At least one shelter failed to crawl and kept its previous records. See ${log_file}."
      ;;
    *)
      abort "Crawl failed, nothing deployed" \
        "The dataset export exited ${export_status}. The site still serves the previous release. See ${log_file}."
      ;;
  esac

  # --- deploy ----------------------------------------------------------------
  #
  # deploy.sh builds apps/web at HEAD in its own throwaway worktree, so
  # nothing here has to build anything. It reads data/dist and
  # apps/web/public/media out of this clone, which is why the clean above
  # leaves both alone.
  log "--- deploy ---"
  local deploy_status=0
  bash "${DEPLOY_SH}" || deploy_status=$?

  if [ "${deploy_status}" -ne 0 ]; then
    abort "Deploy failed" \
      "The dataset exported but scripts/deploy.sh exited ${deploy_status}. The site still serves the previous release. See ${log_file}."
  fi

  # --- done ------------------------------------------------------------------

  local summary
  summary="$(dataset_summary)"
  log "=== deployed: ${summary} ==="

  if [ "${export_status}" -eq 0 ]; then
    notify Information "Crawl deployed" "${summary}."
  else
    notify Information "Degraded crawl deployed" \
      "${summary}. One or more shelters carried previous records forward."
  fi

  return 0
}

# Bash reads a script while it runs it, and this run rewrites this very file
# with `git reset --hard`. Putting the body in a function and calling it from
# a group that ends in exit means the whole file is parsed into memory before
# the first git command touches the disk, and nothing is read back afterwards.
{
  main "$@"
  exit $?
}
