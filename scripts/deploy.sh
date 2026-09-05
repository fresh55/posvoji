#!/usr/bin/env bash
#
# Deploy posvoji.si to the production host.
#
# The site is a static export. A deploy builds it at HEAD in a throwaway git
# worktree, syncs the shared media directory first, ships the export as a new
# release directory, verifies that directory on the host, and only then flips
# the /srv/posvoji/current symlink.
#
# Media is not part of the release. It lives once at /srv/posvoji/media and
# Caddy serves /media/* from there with handle_path, so a release directory
# never contains a media/ tree. See docs/DEPLOY-MEDIA.md for why the order
# below is the order it is: a release that goes live before its photos land
# renders blank heroes, and nothing in the build or the test suite catches it.
#
# Release layout. There are two, and the host decides which one it gets:
#
#   today          the release directory is the site: index.html at its root,
#                  which is what Caddy's docroot points at.
#   layout v2      the release directory holds public/ (the same site) and
#                  private/ (dataset.crawled.json, dataset.published.json and
#                  publication.json). The docroot points at current/public, so
#                  private/ sits outside the file server's root and nothing in
#                  it is reachable over HTTP.
#
# The gate between them is the marker file /srv/posvoji/.layout-v2, which the
# operator creates on the host as the last step of the migration, after the
# docroot has moved and the site has been seen to answer from the new path. It
# is a marker rather than a flag here because this script runs unattended from
# the scheduled crawl every 12 hours (docs/CRAWL-SCHEDULING.md): shipping the
# new layout before the docroot moves would 404 the whole site, and shipping
# private files under today's docroot would publish the datasets. With the
# marker absent this deploys exactly today's layout and ships no private
# artifacts at all, printing a warning and the authoritative runbook path.
#
# Runs from Git Bash on Windows and from a POSIX shell on Linux or macOS. It
# needs git, tar, ssh and pnpm on PATH. Windows additionally needs cmd.exe to
# create the media junction and PowerShell to prove that cleanup detached it.
#
# Usage: see usage() below, or run with -h.

set -euo pipefail

# --- what production looks like ---------------------------------------------

REMOTE_USER="${POSVOJI_DEPLOY_USER:-root}"
REMOTE_HOST="${POSVOJI_DEPLOY_HOST:-116.203.202.17}"
REMOTE="${REMOTE_USER}@${REMOTE_HOST}"

# The recovery key is the one that works unattended. BatchMode=yes makes ssh
# fail instead of prompting, which is what a script wants; it also means the
# host key has to be in known_hosts already, because ssh cannot ask about an
# unknown one in batch mode.
SSH_KEY="${POSVOJI_DEPLOY_KEY:-${HOME}/.ssh/posvoji_hetzner_recovery}"
HEALTH_NETRC="${POSVOJI_HEALTH_NETRC:-/etc/posvoji/health.netrc}"
LOCAL_DEPLOY=false
WITHDRAWAL=false
HOST_CONTROL_DIR=""
HOST_CONTROL_OWNED=false

BASE_DIR="/srv/posvoji"
MEDIA_DIR="${BASE_DIR}/media"
RELEASES_DIR="${BASE_DIR}/releases"
CURRENT_LINK="${BASE_DIR}/current"

# Created by the operator once the Caddy docroot already points at
# current/public and the site has been checked from there. Present means the
# host serves current/public and this script may ship private artifacts;
# absent means it still serves current/ and must not. See the release layout
# note in the header, and the runbook path this script prints while the marker
# is absent.
LAYOUT_MARKER="${BASE_DIR}/.layout-v2"
DEPLOY_LOCK_DIR="${BASE_DIR}/.deploy-lock"

# Long-lived media and release content: owned by the service user, readable by
# the web server's group, and unreadable to everyone else. Locks and staging
# paths are short-lived control state.
OWNERSHIP="posvoji:caddy"
DIR_MODE="750"
FILE_MODE="640"

# How many release directories to keep after a deploy, the new one included.
KEEP_RELEASES=3

# Backstop on the media orphan-delete step below, not the safeguard. The desired
# list is derived on the host from the fully received staging tree, and the live
# list comes from the same strict, newline-safe topology validator used locally.
# This share is what is left over for anything those checks cannot see,
# expressed against the size of the directory so it does not have to be retuned
# as the dataset grows. A flat ceiling had to be: it refused a routine cleanup
# of files left behind by ordinary adoptions.
#
# The floor keeps a small media directory from being hair trigger.
#
# The ingest has the same policy one layer down, where guardMassRemoval in
# apps/ingest/src/run-guards.ts refuses to write a dataset that lost most of a
# provider's animals. That guard is why a catastrophic dataset never reaches
# this directory in the first place. Change one, look at the other.
ORPHAN_DELETE_MAX_PERCENT=20
ORPHAN_DELETE_MIN=500

# --- local paths -------------------------------------------------------------

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOCAL_MEDIA="${REPO_ROOT}/apps/web/public/media"
LOCAL_DIST="${REPO_ROOT}/data/dist"
LOCAL_ARTIFACT_LOCK_HELPER="${REPO_ROOT}/scripts/artifact-lock.mjs"

DRY_RUN=false
ALLOW_DIRTY=false
ASSUME_LAYOUT_V2=false

# Which layout this deploy ships, decided in stage 4 by asking the host for
# the marker. False until then, so nothing before that point can ship a
# private file by accident.
LAYOUT_V2=false

# Set by the build stage, read by the cleanup trap.
TMP_ROOT=""
WORKTREE=""
MEDIA_LINK_KIND="none" # none, junction, symlink or copy
REMOTE_LOCK_HELD=false
# False while an SSH process is in flight and after a signal-style/transport
# status (128+). In either case the remote child may still be running, so a
# new connection must not release the lock and admit an overlapping deploy.
REMOTE_LOCK_RELEASE_SAFE=false
REMOTE_CAPTURE=""
RELEASE_STAGE_DIR=""
REMOTE_STAGE_MAY_EXIST=false
REMOTE_RELEASE_UNHEALTHY=false
MEDIA_STAGE_DIR=""
REMOTE_MEDIA_STAGE_MAY_EXIST=false
LOCAL_ARTIFACT_LOCK_DIR="${REPO_ROOT}/.artifact-lock"
LOCAL_ARTIFACT_LOCK_TOKEN=""
LOCAL_ARTIFACT_LOCK_TOKEN_FILE=""
LOCAL_ARTIFACT_LOCK_HELD=false

# Reserved remote exit status: the live flip failed, but the transaction put
# current back on the exact saved target, proved that link, and received a
# healthy loopback response from it. No other branch in that transaction uses
# this status, so the client can distinguish a verified rollback from an
# ordinary remote failure or an ambiguous SSH result.
VERIFIED_ROLLBACK_STATUS=42

usage() {
  cat <<'USAGE'
Usage: scripts/deploy.sh [--local] [--dry-run] [--allow-dirty] [--assume-layout-v2] [-h]

Builds apps/web at HEAD in a temporary git worktree and deploys the static
export to the production host as a new release.

  --dry-run       Do everything local: preflight, the full build, the artifact.
                  Print every remote command instead of running it. Opens no
                  connection to the host at all.
  --allow-dirty   Deploy with uncommitted changes in the working tree. The
                  build still happens at HEAD, so those changes do not reach
                  production; this only silences the abort.
  --local         Run host operations locally without SSH, using the same
                  layout, host lock, release verification and rollback.
  --withdrawal    After a policy withdrawal and --republish export, remove
                  superseded releases immediately and permit a large media
                  prune. Identity, allowlist and path checks remain required.
  --assume-layout-v2
                  Dry runs only. A dry run opens no connection, so it cannot
                  read the host's layout marker; this prints the layout v2
                  commands instead of today's. A real deploy always asks the
                  host and refuses this flag.
  -h, --help      This text.

Stages:
  1. Preflight     clean tree, verify and snapshot one committed generation
  2. Build         git worktree at HEAD, pnpm install, pnpm --filter web build
  3. Artifact      tar of apps/web/out without media/ and without .br/.gz
  4. Deploy        host lock, layout gate, snapshot validation, media sync,
                   host verify, staged release, atomic flip/health, prune

The layout gate reads /srv/posvoji/.layout-v2 on the host. Present, the
release ships public/ and private/ (both datasets plus publication.json);
absent, it ships today's layout and no private artifacts, and points to the
operator runbook that moves the host onto the new one.

Every layout is packaged only when generation.json matches the six generated
JSON inputs and every referenced media byte. Layout v2 additionally checks the
three generatedAt fields before carrying that generation id into its private
publication.json. The checks run before anything is uploaded.

Docs: docs/DEPLOY-MEDIA.md
USAGE
}

# --- helpers -----------------------------------------------------------------

stage() {
  echo
  echo "=== $* ==="
}

info() { echo "  $*"; }

fail() {
  echo "deploy: $*" >&2
  exit 1
}

validate_shell_fragment() {
  local label="$1" fragment="$2"
  bash -n -c "${fragment}" || fail "internal shell syntax error in ${label}"
}

# ssh from Git for Windows is an MSYS binary, so arguments starting with / are
# passed through as written rather than rewritten into C:\ paths. The env var
# is belt and braces in case that ever stops being true; it does nothing on a
# real POSIX system.
ssh_exec() {
  if "${LOCAL_DEPLOY}"; then
    bash -c "$1"
    return $?
  fi
  MSYS_NO_PATHCONV=1 ssh -i "${SSH_KEY}" \
    -o BatchMode=yes \
    -o ConnectTimeout=10 \
    -o ServerAliveInterval=15 \
    -o ServerAliveCountMax=2 \
    "${REMOTE}" "$@"
}

# Run a command on the host, or print it when --dry-run is set.
remote() {
  local label="$1" cmd="$2" status
  validate_shell_fragment "remote command: ${label}" "${cmd}"
  info "${label}"
  if "${DRY_RUN}"; then
    printf '  [dry-run] would run: ssh -i %s -o BatchMode=yes -o ConnectTimeout=10 -o ServerAliveInterval=15 -o ServerAliveCountMax=2 %s '\''\n' \
      "${SSH_KEY}" "${REMOTE}"
    printf '%s\n' "${cmd}" | sed 's/^/  [dry-run]     /'
    printf '  [dry-run] '\''\n'
    REMOTE_LOCK_RELEASE_SAFE=true
    return 0
  fi
  REMOTE_LOCK_RELEASE_SAFE=false
  if ssh_exec "${cmd}"; then
    REMOTE_LOCK_RELEASE_SAFE=true
    return 0
  else
    status=$?
    # A normal 1..127 is a completed remote command. Signal-style 128+ can be
    # the local ssh client dying while its remote child continues, so retain
    # the lock fail-closed for those statuses as well as OpenSSH's 255.
    if [ "${status}" -lt 128 ]; then
      REMOTE_LOCK_RELEASE_SAFE=true
    fi
    return "${status}"
  fi
}

# Capture one remote command without hiding the transport state in a command
# substitution subshell. The answer is returned through REMOTE_CAPTURE.
remote_capture() {
  local label="$1" cmd="$2" status output
  validate_shell_fragment "remote capture: ${label}" "${cmd}"
  info "${label}"
  REMOTE_LOCK_RELEASE_SAFE=false
  if output="$(ssh_exec "${cmd}")"; then
    REMOTE_LOCK_RELEASE_SAFE=true
    REMOTE_CAPTURE="${output}"
    return 0
  else
    status=$?
    if [ "${status}" -lt 128 ]; then
      REMOTE_LOCK_RELEASE_SAFE=true
    fi
    return "${status}"
  fi
}

# The chown/chmod incantation applied to both the media directory and each
# release directory: owner and group first, then directories and files get
# their own mode because they need different ones. Both call sites want
# exactly this for one directory, differing only in which directory.
own_and_mode_cmd() {
  local dir="$1"
  printf 'find %s -xdev -exec chown %s {} + && find %s -xdev -type d -exec chmod %s {} + && find %s -xdev -type f -exec chmod %s {} +' \
    "${dir}" "${OWNERSHIP}" "${dir}" "${DIR_MODE}" "${dir}" "${FILE_MODE}"
}

# Same, but the remote command reads a tar stream from a local pipeline. The
# local side is passed as a string so the dry run can print the whole pipeline
# rather than half of it. Every path inside those strings is quoted, because
# on Windows they start with a drive letter and can contain spaces.
remote_stream() {
  local label="$1" local_pipeline="$2" cmd="$3"
  local statuses ssh_status
  validate_shell_fragment "local stream: ${label}" "${local_pipeline}"
  validate_shell_fragment "remote stream: ${label}" "${cmd}"
  info "${label}"
  if "${DRY_RUN}"; then
    printf '  [dry-run] would run: %s \\\n' "${local_pipeline}"
    printf '  [dry-run]     | ssh -i %s -o BatchMode=yes -o ConnectTimeout=10 -o ServerAliveInterval=15 -o ServerAliveCountMax=2 %s '\''%s'\''\n' \
      "${SSH_KEY}" "${REMOTE}" "${cmd}"
    REMOTE_LOCK_RELEASE_SAFE=true
    return 0
  fi
  REMOTE_LOCK_RELEASE_SAFE=false
  if eval "${local_pipeline}" | ssh_exec "${cmd}"; then
    REMOTE_LOCK_RELEASE_SAFE=true
    return 0
  else
    # This is the first command in the branch, so PIPESTATUS still describes
    # the two commands above. A local tar/find failure is safe to unlock after;
    # a signal-style ssh status is not, because the remote reader may live on.
    statuses=("${PIPESTATUS[@]}")
    ssh_status="${statuses[1]:-255}"
    if [ "${ssh_status}" -lt 128 ]; then
      REMOTE_LOCK_RELEASE_SAFE=true
    fi
    if [ "${ssh_status}" -ne 0 ]; then
      return "${ssh_status}"
    fi
    return "${statuses[0]:-1}"
  fi
}

release_remote_lock() {
  "${REMOTE_LOCK_HELD}" || return 0
  "${REMOTE_LOCK_RELEASE_SAFE}" || return 1
  if remote "releasing the host deployment lock" \
    "owner=\$(cat ${DEPLOY_LOCK_DIR}/owner 2>/dev/null || true)
if [ \"\$owner\" = ${RELEASE_NAME} ]; then
  rm -f -- ${DEPLOY_LOCK_DIR}/owner || exit 1
  rmdir ${DEPLOY_LOCK_DIR} || { printf '%s\\n' ${RELEASE_NAME} >${DEPLOY_LOCK_DIR}/owner || true; exit 1; }
else
  echo \"refusing to release ${DEPLOY_LOCK_DIR}; owner is \$owner\" >&2
  exit 1
fi"; then
    REMOTE_LOCK_HELD=false
    return 0
  fi
  return 1
}

release_local_artifact_lock() {
  "${LOCAL_ARTIFACT_LOCK_HELD}" || return 0
  if node "${LOCAL_ARTIFACT_LOCK_HELPER}" release \
    "${LOCAL_ARTIFACT_LOCK_DIR}" "${LOCAL_ARTIFACT_LOCK_TOKEN}"; then
    LOCAL_ARTIFACT_LOCK_HELD=false
    return 0
  fi
  return 1
}

# --- cleanup -----------------------------------------------------------------

# Runs on every exit path, including a failed build. The media junction is
# removed before the worktree, with cmd's rmdir rather than rm, so recursive
# cleanup cannot traverse the link into the sibling generation snapshot.
cleanup() {
  local status=$?
  local preserve_temp=false
  local media_path
  local media_windows_path
  local windows_status
  # Cleanup owns EXIT. Signal handlers below turn HUP/INT/TERM into an exit
  # first, so this runs exactly once with the conventional signal status.
  # Ignore further signals and errexit while unwinding: a closed output pipe
  # or a second Ctrl+C must not stop us before a Windows junction is detached.
  trap - EXIT
  trap '' HUP INT PIPE TERM
  set +e
  if "${HOST_CONTROL_OWNED}" && "${REMOTE_LOCK_RELEASE_SAFE}"; then
    remote "removing release verification helpers" \
      "test \"\$(cat ${HOST_CONTROL_DIR}/.deploy-owner 2>/dev/null)\" = ${RELEASE_NAME} && rm -rf --one-file-system -- ${HOST_CONTROL_DIR}" || true
  fi
  if "${REMOTE_RELEASE_UNHEALTHY}" && "${REMOTE_LOCK_HELD}" &&
    "${REMOTE_LOCK_RELEASE_SAFE}"; then
    if remote "removing the published release that failed live health" \
      "case ${RELEASE_DIR} in
  ${RELEASES_DIR}/*)
    if [ ! -e ${RELEASE_DIR} ] && [ ! -L ${RELEASE_DIR} ]; then
      :
    elif [ -d ${RELEASE_DIR} ] && [ ! -L ${RELEASE_DIR} ] &&
      [ \"\$(cat ${RELEASE_DIR}/.deploy-owner 2>/dev/null || true)\" = ${RELEASE_NAME} ]; then
      live=\$(readlink -f ${CURRENT_LINK} 2>/dev/null || true)
      if [ \"\$live\" = ${RELEASE_DIR} ]; then
        echo 'refusing to delete the failed release because current still resolves to it' >&2
        exit 1
      fi
      mounted=\$(awk -v root=${RELEASE_DIR} '\$5 == root || index(\$5, root "/") == 1 { print \$5; exit }' /proc/self/mountinfo) || exit 1
      [ -z \"\$mounted\" ] || { echo \"refusing to delete a failed release containing mountpoint: \$mounted\" >&2; exit 1; }
      rm -rf --one-file-system -- ${RELEASE_DIR}
    else
      echo 'refusing to delete a published release without this run owner marker' >&2
      exit 1
    fi
    ;;
  *) echo 'refusing unsafe failed-release cleanup path' >&2; exit 1 ;;
esac"; then
      REMOTE_RELEASE_UNHEALTHY=false
    else
      echo "  !! CRITICAL: failed release remains at ${RELEASE_DIR}." >&2
      echo "  !! Retaining the deploy lock until current and the release are inspected." >&2
      REMOTE_LOCK_RELEASE_SAFE=false
      if [ "${status}" -eq 0 ]; then status=1; fi
    fi
  fi
  if "${REMOTE_MEDIA_STAGE_MAY_EXIST}" && "${REMOTE_LOCK_HELD}" &&
    "${REMOTE_LOCK_RELEASE_SAFE}"; then
    if remote "removing this run's incomplete media staging directory" \
      "case ${MEDIA_STAGE_DIR} in
  ${BASE_DIR}/.media-stage-*)
    if [ ! -e ${MEDIA_STAGE_DIR} ] && [ ! -L ${MEDIA_STAGE_DIR} ]; then
      :
    elif [ \"\$(cat ${MEDIA_STAGE_DIR}/.deploy-owner 2>/dev/null || true)\" = ${RELEASE_NAME} ]; then
      mounted=\$(awk -v root=${MEDIA_STAGE_DIR} '\$5 == root || index(\$5, root "/") == 1 { print \$5; exit }' /proc/self/mountinfo) || exit 1
      [ -z \"\$mounted\" ] || { echo \"refusing to remove media staging containing mountpoint: \$mounted\" >&2; exit 1; }
      rm -rf --one-file-system -- ${MEDIA_STAGE_DIR}
    else
      echo 'refusing to remove media staging this run does not own' >&2
      exit 1
    fi
    ;;
  *) echo 'refusing unsafe media-staging cleanup path' >&2; exit 1 ;;
esac"; then
      REMOTE_MEDIA_STAGE_MAY_EXIST=false
    else
      echo "  !! WARNING: incomplete media staging may remain at ${MEDIA_STAGE_DIR}." >&2
      if [ "${status}" -eq 0 ]; then status=1; fi
    fi
  fi
  if "${REMOTE_STAGE_MAY_EXIST}" && "${REMOTE_LOCK_HELD}" &&
    "${REMOTE_LOCK_RELEASE_SAFE}"; then
    if remote "removing this run's incomplete release staging directory" \
      "case ${RELEASE_STAGE_DIR} in
  ${RELEASES_DIR}/*.staging)
    if [ ! -e ${RELEASE_STAGE_DIR} ] && [ ! -L ${RELEASE_STAGE_DIR} ]; then
      :
    elif [ \"\$(cat ${RELEASE_STAGE_DIR}/.deploy-owner 2>/dev/null || true)\" = ${RELEASE_NAME} ]; then
      mounted=\$(awk -v root=${RELEASE_STAGE_DIR} '\$5 == root || index(\$5, root "/") == 1 { print \$5; exit }' /proc/self/mountinfo) || exit 1
      [ -z \"\$mounted\" ] || { echo \"refusing to remove release staging containing mountpoint: \$mounted\" >&2; exit 1; }
      rm -rf --one-file-system -- ${RELEASE_STAGE_DIR}
    else
      echo 'refusing to remove a staging directory this run does not own' >&2
      exit 1
    fi
    ;;
  *) echo 'refusing unsafe staging cleanup path' >&2; exit 1 ;;
esac"; then
      REMOTE_STAGE_MAY_EXIST=false
    else
      echo "  !! WARNING: incomplete staging may remain at ${RELEASE_STAGE_DIR}." >&2
      if [ "${status}" -eq 0 ]; then status=1; fi
    fi
  fi
  if "${REMOTE_LOCK_HELD}"; then
    if "${REMOTE_LOCK_RELEASE_SAFE}"; then
      if ! release_remote_lock; then
        echo "  !! WARNING: ${DEPLOY_LOCK_DIR} may be stale; inspect owner before the next deploy." >&2
        if [ "${status}" -eq 0 ]; then status=1; fi
      fi
    else
      echo "  !! WARNING: retaining ${DEPLOY_LOCK_DIR} because the last SSH operation" >&2
      echo "  !! may still be running. Inspect its owner and the host before removing it." >&2
      if [ "${status}" -eq 0 ]; then status=1; fi
    fi
  fi
  if [ -n "${WORKTREE}" ] && [ -d "${WORKTREE}" ]; then
    stage "Cleanup"
    case "${MEDIA_LINK_KIND}" in
      junction)
        media_path="${WORKTREE}/apps/web/public/media"
        media_windows_path=$(cygpath -w "${media_path}")
        info "removing the media junction"
        # Ask Windows to remove the directory entry even when MSYS cannot
        # resolve a dangling or inaccessible junction. Then enumerate the
        # parent directory without following children: Bash's -e/-L tests are
        # not reliable enough for NTFS reparse points to guard a later rm -rf.
        cmd //c rmdir "${media_windows_path}" >/dev/null 2>&1 || true
        DEPLOY_MEDIA_LINK_PATH="${media_windows_path}" powershell.exe \
          -NoLogo -NoProfile -NonInteractive -Command \
          'try {
            $path = $env:DEPLOY_MEDIA_LINK_PATH
            $parent = [IO.Path]::GetDirectoryName($path)
            $leaf = [IO.Path]::GetFileName($path)
            $found = [IO.Directory]::EnumerateFileSystemEntries($parent) |
              Where-Object { [IO.Path]::GetFileName($_) -ceq $leaf } |
              Select-Object -First 1
            if ($null -eq $found) { exit 1 }
            exit 0
          } catch { exit 2 }' >/dev/null 2>&1
        windows_status=$?
        # 1 means the entry is proved absent. Both "still present" (0) and an
        # inspection failure (2) preserve the tree instead of risking a walk
        # through the snapshotted media target.
        if [ "${windows_status}" -ne 1 ]; then
          echo "  !! CRITICAL: could not prove the media junction was detached at ${media_path}." >&2
          echo "  !! Preserving ${TMP_ROOT}; remove the junction before deleting it." >&2
          preserve_temp=true
          if [ "${status}" -eq 0 ]; then status=1; fi
        fi
        ;;
      symlink)
        info "removing the media symlink"
        rm -f "${WORKTREE}/apps/web/public/media" || true
        ;;
    esac
    if ! "${preserve_temp}"; then
      info "removing the build worktree (this takes a moment, the export is large)"
      if ! git -C "${REPO_ROOT}" worktree remove --force "${WORKTREE}" >/dev/null 2>&1 &&
        ! rm -rf "${WORKTREE}"; then
        echo "  !! WARNING: could not remove the build worktree at ${WORKTREE}." >&2
        preserve_temp=true
        if [ "${status}" -eq 0 ]; then status=1; fi
      fi
      git -C "${REPO_ROOT}" worktree prune >/dev/null 2>&1 || true
    fi
  fi
  if ! "${preserve_temp}" && [ -n "${TMP_ROOT}" ] && [ -d "${TMP_ROOT}" ]; then
    if ! rm -rf "${TMP_ROOT}"; then
      echo "  !! WARNING: could not remove temporary directory ${TMP_ROOT}." >&2
      if [ "${status}" -eq 0 ]; then status=1; fi
    fi
  fi
  if [ -n "${LOCAL_ARTIFACT_LOCK_TOKEN_FILE}" ]; then
    rm -f -- "${LOCAL_ARTIFACT_LOCK_TOKEN_FILE}" || true
    LOCAL_ARTIFACT_LOCK_TOKEN_FILE=""
  fi
  if ! release_local_artifact_lock; then
    echo "  !! WARNING: ${LOCAL_ARTIFACT_LOCK_DIR} may be stale; inspect its owner." >&2
    if [ "${status}" -eq 0 ]; then status=1; fi
  fi
  exit "${status}"
}

# --- arguments ---------------------------------------------------------------

while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=true ;;
    --allow-dirty) ALLOW_DIRTY=true ;;
    --local) LOCAL_DEPLOY=true ;;
    --withdrawal) WITHDRAWAL=true ;;
    --assume-layout-v2) ASSUME_LAYOUT_V2=true ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      usage >&2
      fail "unknown argument: $1"
      ;;
  esac
  shift
done

# A real deploy reads the marker off the host. Letting this flag through would
# be a hand-typed claim that the docroot has moved, and if it has not, the
# private datasets land inside what Caddy serves.
if "${ASSUME_LAYOUT_V2}" && ! "${DRY_RUN}"; then
  fail "--assume-layout-v2 is for dry runs. A real deploy asks the host."
fi

cd "${REPO_ROOT}"
if "${WITHDRAWAL}"; then
  KEEP_RELEASES=1
  ORPHAN_DELETE_MAX_PERCENT=100
fi
[[ "${REMOTE_USER}" =~ ^[a-z_][a-z0-9_-]*$ && "${REMOTE_HOST}" =~ ^[a-zA-Z0-9.-]+$ ]] || fail "invalid deploy destination"
[[ "${HEALTH_NETRC}" =~ ^/[a-zA-Z0-9/._-]+$ ]] || fail "health netrc must be a shell-safe absolute host path"

# --- stage 1: preflight ------------------------------------------------------

stage "Preflight"

# data/dist and public/media are one generated snapshot. Exclude exporters and
# derivative jobs while validating and copying that snapshot; every later
# deploy stage reads only the immutable copy under TMP_ROOT.
trap cleanup EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 141' PIPE
trap 'exit 143' TERM
LOCAL_ARTIFACT_LOCK_TOKEN_FILE="$(mktemp "${TMPDIR:-/tmp}/posvoji-artifact-lock.XXXXXX")" ||
  fail "could not create a local artifact-lock token file"
# Invoke the helper directly rather than through command substitution. Its
# recorded holder is process.ppid, which is then this long-lived shell instead
# of the short-lived subshell Bash creates to capture output.
node "${LOCAL_ARTIFACT_LOCK_HELPER}" acquire \
  "${LOCAL_ARTIFACT_LOCK_DIR}" deploy "${LOCAL_ARTIFACT_LOCK_TOKEN_FILE}" ||
  fail "could not acquire the generated artifact lock; no snapshot was read"
LOCAL_ARTIFACT_LOCK_HELD=true
IFS= read -r LOCAL_ARTIFACT_LOCK_TOKEN <"${LOCAL_ARTIFACT_LOCK_TOKEN_FILE}" ||
  fail "could not read the local artifact-lock release token"
case "${LOCAL_ARTIFACT_LOCK_TOKEN}" in
  *[!a-f0-9]*|"")
    fail "the local artifact-lock release token is malformed"
    ;;
esac
[ "${#LOCAL_ARTIFACT_LOCK_TOKEN}" -eq 32 ] ||
  fail "the local artifact-lock release token has the wrong length"
rm -f -- "${LOCAL_ARTIFACT_LOCK_TOKEN_FILE}" ||
  fail "could not remove the local artifact-lock token file"
LOCAL_ARTIFACT_LOCK_TOKEN_FILE=""

HEAD_SHA="$(git rev-parse HEAD)"
HEAD_SHA12="$(git rev-parse --short=12 HEAD)"
HEAD_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
info "HEAD ${HEAD_SHA} on ${HEAD_BRANCH}"

if [ -n "$(git status --porcelain)" ]; then
  if "${ALLOW_DIRTY}"; then
    echo
    echo "  !! WARNING: the working tree is dirty and --allow-dirty was given."
    echo "  !! The build runs against HEAD in a separate worktree, so none of"
    echo "  !! the changes below are in the artifact. What goes to production"
    echo "  !! is ${HEAD_SHA12}, not what you see in your editor."
    echo
    git status --short | sed 's/^/  !!   /'
    echo
  else
    git status --short | sed 's/^/  /'
    fail "working tree is dirty. Commit, stash, or pass --allow-dirty."
  fi
fi

# Generated inputs are gitignored, and a web build alone does not establish
# that they form a complete, internally consistent publication snapshot.
for manifest in animals.json animals.crawled.json image-cache.json overrides.json share-cards.json shelter-logos.json generation.json; do
  [ -f "${LOCAL_DIST}/${manifest}" ] ||
    fail "no data/dist/${manifest}. Run \`pnpm dataset:export\` first."
done
[ -d "${LOCAL_MEDIA}" ] ||
  fail "no apps/web/public/media. Run \`pnpm dataset:export\` first."
node "${REPO_ROOT}/scripts/list-media-files.mjs" "${LOCAL_MEDIA}" >/dev/null ||
  fail "media must contain only regular files in the three flat media directories"
info "dataset and media present"

info "verifying every media file the dataset references"
pnpm media:verify 2>&1 | sed 's/^/  /' ||
  fail "pnpm media:verify failed. Do not deploy on top of missing media."

# Everything after this point reads an immutable private snapshot rather than
# the checkout. Media is hard-linked when the temp directory shares a volume;
# ingest publishes every media write by rename, so those links pin the verified
# inodes while a later run is free to replace source names. Cross-volume
# snapshots fall back to copies. This also makes a hard-killed deploy safe: an
# orphan tar/ssh/build child can keep reading only TMP_ROOT, never mutable
# data/dist or public/media after the checkout lock is released.
TMP_ROOT="$(mktemp -d)" || fail "could not create the deploy temporary directory"
GENERATION_SNAPSHOT="${TMP_ROOT}/generation"
info "snapshotting the committed generation"
node "${REPO_ROOT}/scripts/snapshot-generation.mjs" \
  "${LOCAL_DIST}" "${LOCAL_MEDIA}" "${GENERATION_SNAPSHOT}" 2>&1 |
  sed 's/^/  /' || fail "could not snapshot the committed generation"
LOCAL_DIST="${GENERATION_SNAPSHOT}/dist"
LOCAL_MEDIA="${GENERATION_SNAPSHOT}/media"
release_local_artifact_lock ||
  fail "could not release the checkout artifact lock after snapshotting"
info "checkout artifact lock released; deploy now reads only the snapshot"

if ! "${DRY_RUN}" && ! "${LOCAL_DEPLOY}" && [ ! -f "${SSH_KEY}" ]; then
  fail "no ssh key at ${SSH_KEY}"
fi

RELEASE_NONCE="$(node -e "process.stdout.write(require('node:crypto').randomBytes(8).toString('hex'))")" ||
  fail "could not generate a unique release nonce"
RELEASE_NAME="${HEAD_SHA12}-$(date -u +%Y%m%dT%H%M%SZ)-${RELEASE_NONCE}"
RELEASE_DIR="${RELEASES_DIR}/${RELEASE_NAME}"
MEDIA_STAGE_DIR="${BASE_DIR}/.media-stage-${RELEASE_NAME}"
info "release name: ${RELEASE_NAME}"

# --- stage 2: hermetic build -------------------------------------------------

stage "Build"

WORKTREE="${TMP_ROOT}/worktree"
ARTIFACT="${TMP_ROOT}/${RELEASE_NAME}.tar.gz"
MEDIA_ALLOWLIST="${TMP_ROOT}/media-allowlist.txt"

info "worktree at ${WORKTREE}"
git worktree add --detach "${WORKTREE}" "${HEAD_SHA}" 2>&1 | sed 's/^/  /' ||
  fail "git worktree add failed"

# data/dist is build input, not repository content, so the worktree does not
# have it. It is a few megabytes of JSON, so a copy is fine.
info "copying data/dist into the worktree"
mkdir -p "${WORKTREE}/data"
cp -r "${LOCAL_DIST}" "${WORKTREE}/data/dist" || fail "could not copy data/dist"

# This is a publication allowlist, not a cache inventory. Ingest may retain a
# stale local cache file after a failed best-effort unlink; sending the whole
# directory would make that unreferenced file public again. Derive the exact
# set with the verifier at HEAD, from the immutable snapshot copied above, and
# reuse it for the only media tar stream. That keeps --allow-dirty honest:
# uncommitted verifier changes cannot change what gets published.
node "${WORKTREE}/scripts/verify-media.mjs" --list "${LOCAL_MEDIA}" \
  >"${MEDIA_ALLOWLIST}" ||
  fail "could not derive the current snapshot's verified media allowlist"
MEDIA_ALLOWLIST_COUNT="$(wc -l <"${MEDIA_ALLOWLIST}" | tr -d '[:space:]')"
info "media publication allowlist: ${MEDIA_ALLOWLIST_COUNT} files"

# public/media is large and the export copies it wholesale, so link it in
# rather than copying it twice. A junction, not a symlink: it needs no
# developer mode or elevation on Windows. If that fails for any reason, fall
# back to the slow, always-correct copy.
info "linking apps/web/public/media into the worktree"
mkdir -p "${WORKTREE}/apps/web/public"
MEDIA_PATH="${WORKTREE}/apps/web/public/media"
MEDIA_READY=false
if command -v cygpath >/dev/null 2>&1; then
  # Record the junction before creating it. An interrupt in the tiny window
  # after mklink succeeds must make cleanup use cmd's rmdir, never recursively
  # remove a worktree that still points into the sibling snapshot.
  MEDIA_LINK_KIND="junction"
  if cmd //c mklink //J \
    "$(cygpath -w "${MEDIA_PATH}")" \
    "$(cygpath -w "${LOCAL_MEDIA}")" >/dev/null 2>&1; then
    MEDIA_READY=true
    info "junction created"
  elif [ -e "${MEDIA_PATH}" ] || [ -L "${MEDIA_PATH}" ]; then
    fail "mklink reported failure but left ${MEDIA_PATH}; refusing an ambiguous fallback"
  else
    MEDIA_LINK_KIND="none"
  fi
fi
if ! "${MEDIA_READY}"; then
  # A symlink is safe for rm, but setting the kind before creation keeps the
  # cleanup state accurate on every interrupt boundary.
  MEDIA_LINK_KIND="symlink"
  if ln -s "${LOCAL_MEDIA}" "${MEDIA_PATH}" 2>/dev/null; then
    MEDIA_READY=true
    info "symlink created"
  elif [ -e "${MEDIA_PATH}" ] || [ -L "${MEDIA_PATH}" ]; then
    fail "ln reported failure but left ${MEDIA_PATH}; refusing an ambiguous fallback"
  else
    MEDIA_LINK_KIND="none"
  fi
fi
if ! "${MEDIA_READY}"; then
  MEDIA_LINK_KIND="copy"
  info "no link possible, copying the whole media directory instead"
  cp -r "${LOCAL_MEDIA}" "${MEDIA_PATH}" ||
    fail "could not provide public/media to the build"
fi

info "pnpm install --frozen-lockfile"
INSTALL_ARGS=(--frozen-lockfile)
if "${LOCAL_DEPLOY}"; then INSTALL_ARGS+=(--offline); fi
(cd "${WORKTREE}" && pnpm install "${INSTALL_ARGS[@]}") 2>&1 | sed 's/^/  /' ||
  fail "pnpm install failed in the worktree"

info "pnpm --filter web build"
(cd "${WORKTREE}" && pnpm --filter web build) 2>&1 | sed 's/^/  /' ||
  fail "the web build failed in the worktree"

OUT_DIR="${WORKTREE}/apps/web/out"
[ -s "${OUT_DIR}/index.html" ] ||
  fail "the build produced no ${OUT_DIR}/index.html"
node "${WORKTREE}/scripts/release-status.mjs" create "${LOCAL_DIST}" \
  "${RELEASE_NAME}" "${HEAD_SHA}" "${OUT_DIR}/_posvoji/status.json" ||
  fail "could not bind the public release status to the verified dataset"
if ! UNEXPECTED_EXPORT_PATH="$(find "${OUT_DIR}" \
  -path "${OUT_DIR}/media" -prune -o \
  ! -type f ! -type d -print -quit)"; then
  fail "could not inspect the exported public tree"
fi
[ -z "${UNEXPECTED_EXPORT_PATH}" ] ||
  fail "the exported public tree contains a symlink or special entry: ${UNEXPECTED_EXPORT_PATH}"

# --- stage 3: artifact -------------------------------------------------------

stage "Artifact"

# ./media is excluded because the export copies public/media into out/ and in
# production that directory is shared, outside every release. Caddy serves
# /media/* from /srv/posvoji/media with handle_path, so a copy inside the
# release would be dead weight that shadows nothing.
#
# The .br/.gz exclude is a guard, not a fix. `next build` emits no
# precompressed siblings (nothing in next.config.ts turns that on, and a fresh
# out/ contains none), so the ~10500 of them in the current live release came
# from an earlier hand-made deploy. The Caddyfile has no `precompressed`
# directive and encodes text on the fly, so they were never read. The exclude
# costs nothing and keeps a future plugin from quietly putting 54 MB back.
info "packing apps/web/out without media/ and without .br/.gz"
tar -C "${OUT_DIR}" \
  --exclude=./media \
  --exclude='*.br' \
  --exclude='*.gz' \
  -czf "${ARTIFACT}" . || fail "could not create the artifact"

ARTIFACT_SIZE="$(du -h "${ARTIFACT}" | cut -f1)"
tar -tzf "${ARTIFACT}" >"${TMP_ROOT}/listing.txt" || fail "could not list the artifact"
ARTIFACT_FILES="$(grep -c -v '/$' "${TMP_ROOT}/listing.txt" || true)"

# One real file out of the archive, so the post-upload check on the host tests
# something more than index.html existing. A hashed JS chunk is a good pick:
# its name changes every build, so it cannot pass against a stale release.
SAMPLE_ASSET="$(grep -m1 -E '^\./_next/static/.*\.js$' "${TMP_ROOT}/listing.txt" || true)"
[ -n "${SAMPLE_ASSET}" ] || SAMPLE_ASSET="./index.html"
SAMPLE_ASSET="${SAMPLE_ASSET#./}"
[[ "${SAMPLE_ASSET}" =~ ^_next/static/[A-Za-z0-9._/-]+\.js$ || "${SAMPLE_ASSET}" = index.html ]] ||
  fail "the sample asset has an unsafe archive path: ${SAMPLE_ASSET}"

info "artifact: ${ARTIFACT_SIZE}, ${ARTIFACT_FILES} files"
info "sample asset for the health check: ${SAMPLE_ASSET}"

# --- stage 4: deploy ---------------------------------------------------------

stage "Deploy"

if "${DRY_RUN}"; then
  info "--dry-run: printing the remote commands, running none of them"
fi

# One lock covers every host mutation, including shared-media cleanup and
# pruning. Task Scheduler prevents its own overlap, but this also excludes a
# manual deploy or a run from another clone. A killed client can leave the
# fail-closed directory behind; its owner file names the run to investigate.
REMOTE_LOCK_HELD=true
if remote "acquiring the host deployment lock" \
  "if mkdir ${DEPLOY_LOCK_DIR}; then
  printf '%s\n' ${RELEASE_NAME} >${DEPLOY_LOCK_DIR}/owner || { rm -f -- ${DEPLOY_LOCK_DIR}/owner; rmdir ${DEPLOY_LOCK_DIR}; exit 1; }
else
  owner=\$(cat ${DEPLOY_LOCK_DIR}/owner 2>/dev/null || echo unknown)
  echo \"another deployment holds ${DEPLOY_LOCK_DIR}: \$owner\" >&2
  exit 1
fi"; then
  :
else
  # A normal remote refusal means this run never owned the lock. With ssh 255
  # the mkdir may have succeeded before the connection was lost, so retain the
  # pre-armed ownership state and let cleanup leave it fail-closed.
  if "${REMOTE_LOCK_RELEASE_SAFE}"; then
    REMOTE_LOCK_HELD=false
    fail "could not acquire ${DEPLOY_LOCK_DIR}; no deployment mutation was started"
  fi
  fail "lost the SSH result while acquiring ${DEPLOY_LOCK_DIR}; inspect the host before removing a possible lock"
fi

# Read the privacy-sensitive layout gate and validate the private release
# inputs before touching shared media. A mismatched export must leave the host
# entirely unchanged, not fail only after media has already been synchronized.
if "${DRY_RUN}"; then
  if "${ASSUME_LAYOUT_V2}"; then
    LAYOUT_V2=true
    info "--assume-layout-v2: printing the layout v2 commands"
  else
    info "not asking the host about ${LAYOUT_MARKER}; assuming today's layout"
  fi
else
  remote_capture "asking the host for ${LAYOUT_MARKER}" \
    "if [ -f ${LAYOUT_MARKER} ]; then printf v2; else printf v1; fi" ||
    fail "could not ask the host about ${LAYOUT_MARKER}"
  case "${REMOTE_CAPTURE}" in
    v2) LAYOUT_V2=true ;;
    v1) LAYOUT_V2=false ;;
    *) fail "unexpected answer about ${LAYOUT_MARKER}: ${REMOTE_CAPTURE}" ;;
  esac
fi

HOST_CONTROL_DIR="${BASE_DIR}/.deploy-control-${RELEASE_NAME}"
remote_stream "installing private release verification helpers" \
  "tar -C '${WORKTREE}/scripts' -cf - verify-release.sh release-status.mjs" \
  "umask 077; mkdir -m 700 ${HOST_CONTROL_DIR} && printf '%s\\n' ${RELEASE_NAME} >${HOST_CONTROL_DIR}/.deploy-owner && tar -C ${HOST_CONTROL_DIR} -xf - --no-same-owner --no-same-permissions" ||
  fail "could not stage release verification helpers"
HOST_CONTROL_OWNED=true
remote_stream "staging the candidate release identity" \
  "cat '${OUT_DIR}/_posvoji/status.json'" \
  "cat >${HOST_CONTROL_DIR}/candidate.json" || fail "could not stage release identity"

if "${LAYOUT_V2}"; then
  SNAPSHOT_DIST="${WORKTREE}/data/dist"
  [ -f "${SNAPSHOT_DIST}/animals.crawled.json" ] ||
    fail "no data/dist/animals.crawled.json. The host is on layout v2, which ships it. Run \`pnpm dataset:export\` first."
  PRIVATE_STAGE="${TMP_ROOT}/private"
  mkdir -p "${PRIVATE_STAGE}"
  cp "${SNAPSHOT_DIST}/animals.crawled.json" "${PRIVATE_STAGE}/dataset.crawled.json" ||
    fail "could not stage dataset.crawled.json"
  cp "${SNAPSHOT_DIST}/animals.json" "${PRIVATE_STAGE}/dataset.published.json" ||
    fail "could not stage dataset.published.json"
  info "checking the dataset generation and writing publication.json"
  node "${WORKTREE}/scripts/publication.cjs" \
    "${SNAPSHOT_DIST}" "${RELEASE_NAME}" "${PRIVATE_STAGE}/publication.json" ||
    fail "the release was not packaged; nothing was uploaded"
  info "publication.json: $(tr -d '\n ' <"${PRIVATE_STAGE}/publication.json")"
fi

# Prove the host can complete this layout before shared media changes. The
# marker is only a gate when the active file-server route agrees with it; the
# structural Caddy check below prevents a stale/incorrect marker from turning
# private/ into public content on the next flip.
if "${LAYOUT_V2}"; then
  CURRENT_SITE_SUFFIX="/public"
  EXPECTED_DOCROOT="${CURRENT_LINK}/public"
  FORBIDDEN_DOCROOT="${CURRENT_LINK}"
  MARKER_ASSERT="test -f ${LAYOUT_MARKER} || { echo 'layout v2 marker disappeared while the lock was held' >&2; exit 1; }"
else
  CURRENT_SITE_SUFFIX=""
  EXPECTED_DOCROOT="${CURRENT_LINK}"
  FORBIDDEN_DOCROOT="${CURRENT_LINK}/public"
  MARKER_ASSERT="test ! -f ${LAYOUT_MARKER} || { echo 'layout v2 marker appeared while the lock was held' >&2; exit 1; }"
fi

remote "checking host prerequisites and the current release before media mutation" \
  "set -u
test \"\$(cat ${DEPLOY_LOCK_DIR}/owner 2>/dev/null || true)\" = ${RELEASE_NAME} || { echo 'deployment lock ownership changed' >&2; exit 1; }
${MARKER_ASSERT}
for tool in awk chown chmod comm curl find getent grep head id ln mktemp mv node readlink rm sed sort stat tail tar wc; do
  command -v \"\$tool\" >/dev/null 2>&1 || { echo \"required host tool is missing: \$tool\" >&2; exit 1; }
done
test \"\$(id -u)\" = 0 || { ${LOCAL_DEPLOY} && test \"\$(id -un)\" = posvoji; } || { echo 'deployment requires root remotely or posvoji locally' >&2; exit 1; }
getent passwd posvoji >/dev/null || { echo 'host user posvoji does not exist' >&2; exit 1; }
getent group caddy >/dev/null || { echo 'host group caddy does not exist' >&2; exit 1; }
test -d ${BASE_DIR} && test ! -L ${BASE_DIR} || { echo '${BASE_DIR} is not a real directory' >&2; exit 1; }
test -d ${RELEASES_DIR} && test ! -L ${RELEASES_DIR} || { echo '${RELEASES_DIR} is not a real directory' >&2; exit 1; }
test -L ${CURRENT_LINK} || { echo '${CURRENT_LINK} is not a symlink' >&2; exit 1; }
live=\$(readlink -f ${CURRENT_LINK}) || { echo 'current is dangling or unreadable' >&2; exit 1; }
case \"\$live\" in
  ${RELEASES_DIR}/*) : ;;
  *) echo \"current resolves outside ${RELEASES_DIR}: \$live\" >&2; exit 1 ;;
esac
test -s \"\$live${CURRENT_SITE_SUFFIX}/index.html\" || { echo 'the current release has no nonempty index at the selected layout path' >&2; exit 1; }
test -r /proc/self/mountinfo || { echo 'host mount table is unreadable' >&2; exit 1; }
if [ -e ${MEDIA_DIR} ] || [ -L ${MEDIA_DIR} ]; then
  test -d ${MEDIA_DIR} && test ! -L ${MEDIA_DIR} || { echo '${MEDIA_DIR} is not a real directory' >&2; exit 1; }
  media_mount=\$(awk -v root=${MEDIA_DIR} '\$5 == root || index(\$5, root "/") == 1 { print \$5; exit }' /proc/self/mountinfo) || exit 1
  [ -z \"\$media_mount\" ] || { echo \"mountpoint at or under ${MEDIA_DIR}: \$media_mount\" >&2; exit 1; }
fi
for unused in ${MEDIA_STAGE_DIR} ${RELEASE_DIR} ${RELEASE_DIR}.staging /tmp/posvoji-verify-${RELEASE_NAME} ${CURRENT_LINK}.${RELEASE_NAME}.next; do
  if [ -e \"\$unused\" ] || [ -L \"\$unused\" ]; then
    echo \"refusing to reuse a path that already exists: \$unused\" >&2
    exit 1
  fi
done
find ${BASE_DIR} -maxdepth 0 -printf '' >/dev/null || { echo 'host find lacks required GNU -printf support' >&2; exit 1; }
mv --help 2>&1 | grep -q -- '-T' || { echo 'host mv lacks required GNU -T support' >&2; exit 1; }
rm --help 2>&1 | grep -q -- '--one-file-system' || { echo 'host rm lacks --one-file-system' >&2; exit 1; }
stat -c '%d' ${BASE_DIR} >/dev/null || { echo 'host stat lacks required GNU -c support' >&2; exit 1; }
tar --help 2>&1 | grep -q -- '--no-same-owner' || { echo 'host tar lacks --no-same-owner support' >&2; exit 1; }
tar --help 2>&1 | grep -q -- '--no-same-permissions' || { echo 'host tar lacks --no-same-permissions support' >&2; exit 1; }
node -e 'process.exit(Number(process.versions.node.split(\".\")[0]) >= 22 ? 0 : 1)' || { echo 'host Node.js 22+ is required' >&2; exit 1; }
echo 'host prerequisites and current release: OK'"

remote "checking current HTTPS bytes and input ordering before media changes" \
  "bash ${HOST_CONTROL_DIR}/verify-release.sh ${CURRENT_LINK}${CURRENT_SITE_SUFFIX} https://posvoji.si ${HEALTH_NETRC} legacy posvoji.si:443:127.0.0.1 && node ${HOST_CONTROL_DIR}/release-status.mjs order ${CURRENT_LINK}${CURRENT_SITE_SUFFIX}/_posvoji/status.json ${HOST_CONTROL_DIR}/candidate.json" ||
  fail "current production cannot be verified or the candidate has been superseded"

CADDY_CONFIG_CMD="curl --disable -fsS --noproxy '*' --connect-timeout 2 --max-time 5 http://127.0.0.1:2019/config/"
if "${DRY_RUN}"; then
  remote "reading the active Caddy configuration for a local structural check" \
    "${CADDY_CONFIG_CMD}"
  info "would validate the captured JSON locally for host posvoji.si, root ${EXPECTED_DOCROOT}, clean .html fallback, shared /media/* route ${MEDIA_DIR}, and forbidden root ${FORBIDDEN_DOCROOT}"
else
  remote_capture "reading the active Caddy configuration" "${CADDY_CONFIG_CMD}" ||
    fail "could not read Caddy's active configuration; shared media was not changed"
  printf '%s' "${REMOTE_CAPTURE}" |
    node "${REPO_ROOT}/scripts/validate-caddy-layout.cjs" \
      --host posvoji.si \
      --root "${EXPECTED_DOCROOT}" \
      --require-route "/media/*=${MEDIA_DIR}" \
      --require-clean-html \
      --forbid-root "${FORBIDDEN_DOCROOT}" ||
    fail "the active Caddy route disagrees with ${LAYOUT_MARKER}; shared media was not changed"
fi

# Media first, always. The tar contains only files referenced by the current
# generated snapshot; a stale cache entry is never uploaded or counted as
# desired. It lands outside the live media tree. Each complete staged file is
# then renamed over its live counterpart on the same filesystem, so an
# interrupted transfer can never leave visitors reading a truncated share card
# or image. This adds and overwrites only; the guarded list diff below handles
# deletions separately.
REMOTE_MEDIA_STAGE_MAY_EXIST=true
remote_stream "staging the snapshot-referenced media (no live writes yet)" \
  "tar -C '${LOCAL_MEDIA}' -cf - -T '${MEDIA_ALLOWLIST}'" \
  "mkdir ${MEDIA_STAGE_DIR} && printf '%s\\n' ${RELEASE_NAME} >${MEDIA_STAGE_DIR}/.deploy-owner && tar -C ${MEDIA_STAGE_DIR} -xf - --no-same-owner"

remote "fixing ownership and modes on staged media" \
  "$(own_and_mode_cmd "${MEDIA_STAGE_DIR}")"

remote_stream "atomically installing staged media files" \
  "cat '${REPO_ROOT}/scripts/list-media-files.mjs'" \
  "set -u
test \"\$(cat ${MEDIA_STAGE_DIR}/.deploy-owner 2>/dev/null || true)\" = ${RELEASE_NAME} || { echo 'media staging ownership is missing or wrong' >&2; exit 1; }
stage_mount=\$(awk -v root=${MEDIA_STAGE_DIR} '\$5 == root || index(\$5, root "/") == 1 { print \$5; exit }' /proc/self/mountinfo) || exit 1
[ -z \"\$stage_mount\" ] || { echo \"nested mount under media staging: \$stage_mount\" >&2; exit 1; }
unexpected=\$(find ${MEDIA_STAGE_DIR} -mindepth 1 ! -type f ! -type d -print -quit) || exit 1
[ -z \"\$unexpected\" ] || { echo \"unexpected path in media staging: \$unexpected\" >&2; exit 1; }
empty=\$(find ${MEDIA_STAGE_DIR} -type f ! -path ${MEDIA_STAGE_DIR}/.deploy-owner ! -path ${MEDIA_STAGE_DIR}/.deploy-files -empty -print -quit) || exit 1
[ -z \"\$empty\" ] || { echo \"empty file in media staging: \$empty\" >&2; exit 1; }
mkdir -p ${MEDIA_DIR} || exit 1
live_mount=\$(awk -v root=${MEDIA_DIR} '\$5 == root || index(\$5, root "/") == 1 { print \$5; exit }' /proc/self/mountinfo) || exit 1
[ -z \"\$live_mount\" ] || { echo \"nested mount under live media: \$live_mount\" >&2; exit 1; }
node - ${MEDIA_DIR} >/dev/null || { echo 'live media topology is unsafe' >&2; exit 1; }
unexpected=\$(find ${MEDIA_DIR} -mindepth 1 ! -type f ! -type d -print -quit) || exit 1
[ -z \"\$unexpected\" ] || { echo \"unexpected path in live media: \$unexpected\" >&2; exit 1; }
unsorted=\$(mktemp) || exit 1
cleanup_media_list() { rm -f -- \"\$unsorted\"; }
trap cleanup_media_list 0
trap 'exit 129' 1
trap 'exit 130' 2
trap 'exit 141' 13
trap 'exit 143' 15
find ${MEDIA_STAGE_DIR} -type f ! -path ${MEDIA_STAGE_DIR}/.deploy-owner ! -path ${MEDIA_STAGE_DIR}/.deploy-files -printf '%P\\n' >\"\$unsorted\" || exit 1
LC_ALL=C sort \"\$unsorted\" >${MEDIA_STAGE_DIR}/.deploy-files || exit 1
# GNU mv copies and unlinks on EXDEV, which would expose a partial destination.
# Prove every destination directory is on the staging device before moving the
# first file; nested media mount points are covered as well as MEDIA_DIR itself.
stage_device=\$(stat -c '%d' ${MEDIA_STAGE_DIR}) || exit 1
previous_dest_dir=
while IFS= read -r rel; do
  [ -n \"\$rel\" ] || continue
  rel_dir=\${rel%/*}
  if [ \"\$rel_dir\" = \"\$rel\" ]; then
    dest_dir=${MEDIA_DIR}
  else
    dest_dir=${MEDIA_DIR}/\$rel_dir
  fi
  if [ \"\$dest_dir\" != \"\$previous_dest_dir\" ]; then
    mkdir -p \"\$dest_dir\" || exit 1
    dest_device=\$(stat -c '%d' \"\$dest_dir\") || exit 1
    [ \"\$dest_device\" = \"\$stage_device\" ] || {
      echo \"media staging and destination are on different filesystems: \$dest_dir\" >&2
      exit 1
    }
    previous_dest_dir=\$dest_dir
  fi
done <${MEDIA_STAGE_DIR}/.deploy-files
while IFS= read -r rel; do
  [ -n \"\$rel\" ] || continue
  mv -fT -- \"${MEDIA_STAGE_DIR}/\$rel\" \"${MEDIA_DIR}/\$rel\" || exit 1
done <${MEDIA_STAGE_DIR}/.deploy-files
find ${MEDIA_STAGE_DIR} -mindepth 1 -depth -type d -empty -delete || exit 1"

remote "fixing ownership and modes on the media directory" \
  "$(own_and_mode_cmd "${MEDIA_DIR}")"

# Right to exit: a photo a shelter withdraws has to stop being served, not just
# stop being linked (see DATA-POLICY.md). The desired list is produced on the
# host from the fully received staging tree before any file moves. It therefore
# cannot be a truncated second stream and describes exactly what was installed.
HOST_ORPHAN_DIFF_CMD="set -u
test \"\$(cat ${MEDIA_STAGE_DIR}/.deploy-owner 2>/dev/null || true)\" = ${RELEASE_NAME} || { echo 'media staging ownership is missing or wrong' >&2; exit 1; }
desired=${MEDIA_STAGE_DIR}/.deploy-files
test -f \"\${desired}\" || { echo 'staged media file list is missing' >&2; exit 1; }
tmp_remote=
tmp_orphans=
cleanup_orphan_diff() {
  rm -f -- \"\${tmp_remote}\" \"\${tmp_orphans}\"
}
trap cleanup_orphan_diff 0
trap 'exit 129' 1
trap 'exit 130' 2
trap 'exit 141' 13
trap 'exit 143' 15
tmp_remote=\$(mktemp) || exit 1
tmp_orphans=\$(mktemp) || exit 1
node - ${MEDIA_DIR} >\"\${tmp_remote}\" || exit 1
remote_count=\$(wc -l <\"\${tmp_remote}\") || exit 1
echo \"media files on host: \${remote_count}\"
LC_ALL=C comm -13 \"\${desired}\" \"\${tmp_remote}\" >\"\${tmp_orphans}\" || exit 1
orphan_count=\$(wc -l <\"\${tmp_orphans}\") || exit 1
allowed=\$(( \${remote_count} * ${ORPHAN_DELETE_MAX_PERCENT} / 100 ))
if [ \"\${allowed}\" -lt ${ORPHAN_DELETE_MIN} ]; then allowed=${ORPHAN_DELETE_MIN}; fi
if [ \"\${orphan_count}\" -eq 0 ]; then
  echo 'no orphaned media files on the host'
elif [ \"\${orphan_count}\" -gt \"\${allowed}\" ]; then
  echo \"refusing to delete \${orphan_count} of the host's \${remote_count} media files, over the ${ORPHAN_DELETE_MAX_PERCENT} percent backstop (\${allowed}); nothing was deleted. The first of them:\" >&2
  head -20 \"\${tmp_orphans}\" >&2 || exit 1
  exit 1
else
  while IFS= read -r orphan; do
    [ -n \"\${orphan}\" ] || continue
    rm -f -- \"${MEDIA_DIR}/\${orphan}\" || {
      echo \"could not remove ${MEDIA_DIR}/\${orphan}\" >&2
      exit 1
    }
  done <\"\${tmp_orphans}\"
  echo \"removed \${orphan_count} orphaned media file(s) from the host\"
fi"
remote_stream "removing media the host has that the staged dataset no longer references" \
  "cat '${REPO_ROOT}/scripts/list-media-files.mjs'" \
  "${HOST_ORPHAN_DIFF_CMD}"

remote "removing the completed media staging directory" \
  "test \"\$(cat ${MEDIA_STAGE_DIR}/.deploy-owner 2>/dev/null || true)\" = ${RELEASE_NAME} || { echo 'media staging ownership is missing or wrong' >&2; exit 1; }
find ${MEDIA_STAGE_DIR} -mindepth 1 -depth -type d -empty -delete || exit 1
rm -f -- ${MEDIA_STAGE_DIR}/.deploy-files || exit 1
rm -f -- ${MEDIA_STAGE_DIR}/.deploy-owner || exit 1
rmdir ${MEDIA_STAGE_DIR} || { printf '%s\\n' ${RELEASE_NAME} >${MEDIA_STAGE_DIR}/.deploy-owner || true; exit 1; }"
REMOTE_MEDIA_STAGE_MAY_EXIST=false

# (a3) Verify the media the host now actually has, not the local directory
#      the build just read from (where a gap is nearly impossible). This is
#      the only check in the whole pipeline that can catch the exact failure
#      this script is organised around: a missing .avif renders a blank hero
#      with no fallback, and a missing ladder rung renders nothing, and
#      neither fails a build or the pre-flip health check below, which only
#      looks at index.html and one JS chunk. verify-media.mjs has no package
#      dependencies; the host only needs the same Node 22+ runtime documented
#      for deployment. Ships the scripts plus the complete receipt-bound
#      data/dist snapshot
#      to a throwaway directory on the host, runs it against the shared media
#      root, and aborts before the flip on a nonzero exit.
HOST_VERIFY_DIR="/tmp/posvoji-verify-${RELEASE_NAME}"
HOST_VERIFY_FILES="scripts/verify-media.mjs scripts/media-references.mjs scripts/generation-receipt.mjs"
HOST_VERIFY_FILES="${HOST_VERIFY_FILES} data/dist/animals.json data/dist/animals.crawled.json data/dist/image-cache.json data/dist/overrides.json"
HOST_VERIFY_FILES="${HOST_VERIFY_FILES} data/dist/share-cards.json data/dist/shelter-logos.json data/dist/generation.json"
if [ -f "${WORKTREE}/data/dist/crawl-manifest.json" ]; then
  HOST_VERIFY_FILES="${HOST_VERIFY_FILES} data/dist/crawl-manifest.json"
fi
remote_stream "shipping verify-media.mjs and the dist manifests to the host" \
  "tar -C '${WORKTREE}' -cf - ${HOST_VERIFY_FILES}" \
  "set -u
verify_dir_owned=false
verify_upload_complete=false
cleanup_verify_upload() {
  if \"\$verify_dir_owned\" && ! \"\$verify_upload_complete\"; then
    rm -rf --one-file-system -- ${HOST_VERIFY_DIR} ||
      echo 'WARNING: could not remove the incomplete host verification directory' >&2
  fi
}
trap cleanup_verify_upload 0
trap 'exit 129' 1
trap 'exit 130' 2
trap 'exit 141' 13
trap 'exit 143' 15
umask 077
mkdir -m 700 ${HOST_VERIFY_DIR} || exit 1
verify_dir_owned=true
if ! printf '%s\\n' ${RELEASE_NAME} >${HOST_VERIFY_DIR}/.deploy-owner; then
  exit 1
fi
tar -C ${HOST_VERIFY_DIR} -xf - --no-same-owner --no-same-permissions || exit 1
exposed=\$(find ${HOST_VERIFY_DIR} -perm /077 -print -quit) || exit 1
[ -z \"\$exposed\" ] || { echo \"host verification input is group/world-accessible: \$exposed\" >&2; exit 1; }
verify_upload_complete=true"

remote "verifying media on the host" \
  "test \"\$(stat -c '%u:%a' ${HOST_VERIFY_DIR} 2>/dev/null || true)\" = \"\$(id -u):700\" || { echo 'host verification directory ownership or mode is unsafe' >&2; exit 1; }
test \"\$(cat ${HOST_VERIFY_DIR}/.deploy-owner 2>/dev/null || true)\" = ${RELEASE_NAME} || { echo 'host verification ownership is missing or wrong' >&2; exit 1; }
node ${HOST_VERIFY_DIR}/scripts/verify-media.mjs ${MEDIA_DIR}
verify_status=\$?
if ! rm -rf --one-file-system -- ${HOST_VERIFY_DIR}; then
  echo 'could not remove the host verification directory' >&2
  if [ \"\${verify_status}\" -eq 0 ]; then verify_status=1; fi
fi
exit \${verify_status}"

# (a4) Choose the release paths from the exact layout answer obtained before
#       media sync. Where index.html goes is what the docroot points at.
RELEASE_STAGE_DIR="${RELEASE_DIR}.staging"
if "${LAYOUT_V2}"; then
  RELEASE_SITE_DIR="${RELEASE_STAGE_DIR}/public"
  RELEASE_PRIVATE_DIR="${RELEASE_STAGE_DIR}/private"
  info "layout v2: the release ships public/ and private/"
else
  RELEASE_SITE_DIR="${RELEASE_STAGE_DIR}"
  RELEASE_PRIVATE_DIR=""
  echo
  echo "  !! The host has no ${LAYOUT_MARKER}, so this deploy ships today's"
  echo "  !! layout and NO private artifacts. The datasets and the release"
  echo "  !! receipt are withheld: under the current docroot every file in"
  echo "  !! the release directory is downloadable, and private/ would be"
  echo "  !! too."
  echo "  !!"
  echo "  !! Layout v2 migration is an operator procedure, not a deploy step."
  echo "  !! Pause the scheduled crawl and follow the single authoritative runbook:"
  echo "  !!"
  echo "  !!   docs/DEPLOY-MEDIA.md#moving-the-host-onto-layout-v2"
  echo "  !!"
  echo "  !! It covers the release self-links, Caddy docroot, layout marker,"
  echo "  !! fail-closed structural and HTTP checks, the atomic rollback drill,"
  echo "  !! and the point at which the scheduled crawl is safe to resume."
  echo "  !! After creating ${LAYOUT_MARKER}, run one deploy by hand before"
  echo "  !! verification; that is the first release with public/ and private/."
  echo
fi

# (b) The release directory.
RELEASE_CREATE_CMD="mkdir ${RELEASE_STAGE_DIR} && printf '%s\\n' ${RELEASE_NAME} >${RELEASE_STAGE_DIR}/.deploy-owner"
if "${LAYOUT_V2}"; then
  RELEASE_CREATE_CMD="${RELEASE_CREATE_CMD} && mkdir ${RELEASE_SITE_DIR}"
fi
REMOTE_STAGE_MAY_EXIST=true
remote_stream "uploading the release to ${RELEASE_SITE_DIR}" \
  "cat '${ARTIFACT}'" \
  "${RELEASE_CREATE_CMD} && tar -C ${RELEASE_SITE_DIR} -xzf - --no-same-owner"

# (b2) The private half of a layout v2 release: the two datasets and the
#      receipt that says which run produced them, all three staged and checked
#      at the layout gate above. Never uploaded under the old layout, and never
#      inside public/, because Caddy serves that directory and serves it whole.
if "${LAYOUT_V2}"; then
  remote_stream "uploading the private artifacts to ${RELEASE_PRIVATE_DIR}" \
    "tar -C '${PRIVATE_STAGE}' -cf - ." \
    "mkdir ${RELEASE_PRIVATE_DIR} && tar -C ${RELEASE_PRIVATE_DIR} -xf - --no-same-owner"
fi

# Recursive over the release root, so public/ and private/ are both covered by
# one pass in either layout: 750 on directories, 640 on files, owned by the
# service user and readable by Caddy's group. private/ is kept out of reach by
# where it sits, not by its mode.
remote "fixing ownership and modes on the release" \
  "chown ${OWNERSHIP} ${RELEASES_DIR} && chmod ${DIR_MODE} ${RELEASES_DIR} && $(own_and_mode_cmd "${RELEASE_STAGE_DIR}")"

# (c) Check the new directory before anything points at it. A release that
#     unpacked short is still invisible at this point; after the flip it is the
#     site.
RELEASE_CHECK_CMD="test -s ${RELEASE_SITE_DIR}/index.html || { echo 'index.html missing or empty' >&2; exit 1; }
test -s ${RELEASE_SITE_DIR}/${SAMPLE_ASSET} || { echo '${SAMPLE_ASSET} missing or empty' >&2; exit 1; }
unexpected=\$(find ${RELEASE_SITE_DIR} -mindepth 1 ! -type f ! -type d -print -quit) || exit 1
[ -z \"\$unexpected\" ] || { echo \"public tree contains a symlink or special entry: \$unexpected\" >&2; exit 1; }"
if "${LAYOUT_V2}"; then
  # public/ has to be a real directory in a release this script just built.
  # The migration runbook gives every pre-existing release a `public -> .`
  # self-symlink so it can be served from the moved docroot, and those releases
  # are legitimate rollback targets; this check
  # never looks at one, because it only ever inspects the release of this run,
  # whose public/ was made by the mkdir above. Asserting it is a directory and
  # not a link is what keeps the two cases apart: `test -s public/index.html`
  # alone follows a self-symlink and would pass on a v1 release.
  RELEASE_CHECK_CMD="test -d ${RELEASE_SITE_DIR} && test ! -L ${RELEASE_SITE_DIR} || { echo 'public/ is not a real directory in this release' >&2; exit 1; }
${RELEASE_CHECK_CMD}
for f in dataset.crawled.json dataset.published.json publication.json; do
  test -s ${RELEASE_PRIVATE_DIR}/\$f || { echo \"private/\$f missing or empty\" >&2; exit 1; }
  test ! -e ${RELEASE_SITE_DIR}/\$f && test ! -L ${RELEASE_SITE_DIR}/\$f || { echo \"private artifact \$f ended up inside the docroot\" >&2; exit 1; }
done
test ! -e ${RELEASE_SITE_DIR}/private && test ! -L ${RELEASE_SITE_DIR}/private || { echo 'private/ ended up inside the docroot' >&2; exit 1; }"
fi
remote "checking the new release before the flip" \
  "${RELEASE_CHECK_CMD}
echo 'release contents look complete'"

# Only a fully uploaded and verified directory receives a release-shaped name.
# Pre-arm owner-checked cleanup before the atomic rename so a signal cannot
# leave an unverified completed release eligible for rollback pruning.
REMOTE_RELEASE_UNHEALTHY=true
remote "publishing the complete release directory" \
  "test ! -e ${RELEASE_DIR} && test ! -L ${RELEASE_DIR} || { echo 'release destination already exists' >&2; exit 1; }
test \"\$(cat ${RELEASE_STAGE_DIR}/.deploy-owner 2>/dev/null || true)\" = ${RELEASE_NAME} || { echo 'release staging ownership is missing or wrong' >&2; exit 1; }
mv -T -- ${RELEASE_STAGE_DIR} ${RELEASE_DIR} || { printf '%s\\n' ${RELEASE_NAME} >${RELEASE_STAGE_DIR}/.deploy-owner || true; exit 1; }"
REMOTE_STAGE_MAY_EXIST=false

# (d/e) Build a sibling link, set its ownership, then rename it over current.
#       Both paths are in the same directory, so GNU mv uses one atomic rename:
#       a request sees either the old link or the new one, never a missing link.
#       The loopback health check runs in the same remote transaction. Its EXIT
#       trap restores the old target on failure, verifies both the exact link
#       and its loopback response, and returns the reserved status above only
#       after that proof. A lost connection or failed proof remains ambiguous.
NEXT_LINK="${CURRENT_LINK}.${RELEASE_NAME}.next"
FLIP_STATUS=0
remote "atomically flipping ${CURRENT_LINK} to ${RELEASE_NAME} and checking it" \
  "set -u
next=${NEXT_LINK}
old=\$(readlink ${CURRENT_LINK}) || { echo 'current is not a readable symlink' >&2; exit 1; }
restore_needed=false
atomic_link() {
  target=\$1
  ln -sfnT -- \"\$target\" \"\$next\" &&
    chown -h ${OWNERSHIP} \"\$next\" &&
    mv -Tf -- \"\$next\" ${CURRENT_LINK}
}
rollback() {
  saved_status=\$?
  trap - 0
  trap '' 1 2 13 15
  cleanup_failed=false
  rollback_verified=false
  if [ \"\$restore_needed\" = true ]; then
    found=\$(readlink ${CURRENT_LINK} 2>/dev/null || true)
    case \"\$found\" in
      \"${RELEASE_DIR}\"|\"\$old\")
        if atomic_link \"\$old\" && test \"\$(readlink ${CURRENT_LINK})\" = \"\$old\"; then
          echo \"restored after failed deploy: ${CURRENT_LINK} -> \$old\"
          if bash ${HOST_CONTROL_DIR}/verify-release.sh \"\$old${CURRENT_SITE_SUFFIX}\" https://posvoji.si ${HEALTH_NETRC} legacy posvoji.si:443:127.0.0.1; then
            rollback_verified=true
            echo 'verified rollback release bytes'
          else
            echo 'CRITICAL: restored target failed authenticated release verification' >&2
            cleanup_failed=true
          fi
        else
          echo \"CRITICAL: could not restore ${CURRENT_LINK} -> \$old\" >&2
          cleanup_failed=true
        fi
        ;;
      *)
        echo \"CRITICAL: refusing to overwrite ${CURRENT_LINK}; it changed to \$found\" >&2
        cleanup_failed=true
        ;;
    esac
  fi
  rm -f -- \"\$next\" || cleanup_failed=true
  if \"\$rollback_verified\" && ! \"\$cleanup_failed\"; then
    exit ${VERIFIED_ROLLBACK_STATUS}
  fi
  if \"\$cleanup_failed\" && [ \"\$saved_status\" -eq 0 ]; then
    saved_status=1
  fi
  exit \"\$saved_status\"
}
trap rollback 0
trap 'exit 129' 1
trap 'exit 130' 2
trap 'exit 141' 13
trap 'exit 143' 15
test \"\$(cat ${RELEASE_DIR}/.deploy-owner 2>/dev/null || true)\" = ${RELEASE_NAME} || { echo 'published release owner marker is missing or wrong' >&2; exit 1; }
test \"\$(readlink ${CURRENT_LINK})\" = \"\$old\" || { echo 'current changed before the flip' >&2; exit 1; }
node ${HOST_CONTROL_DIR}/release-status.mjs order ${CURRENT_LINK}${CURRENT_SITE_SUFFIX}/_posvoji/status.json ${HOST_CONTROL_DIR}/candidate.json || exit 1
restore_needed=true
atomic_link ${RELEASE_DIR} || { echo 'atomic current flip failed' >&2; exit 1; }
test \"\$(readlink ${CURRENT_LINK})\" = ${RELEASE_DIR} || { echo 'current points at the wrong release' >&2; exit 1; }
bash ${HOST_CONTROL_DIR}/verify-release.sh ${RELEASE_DIR}${CURRENT_SITE_SUFFIX} https://posvoji.si ${HEALTH_NETRC} strict posvoji.si:443:127.0.0.1 || { echo 'post-flip release verification failed' >&2; exit 1; }
echo 'verified live release bytes'
rm -f -- ${RELEASE_DIR}/.deploy-owner || { echo 'could not clear the published release owner marker' >&2; exit 1; }
restore_needed=false" || FLIP_STATUS=$?
if [ "${FLIP_STATUS}" -ne 0 ]; then
  if [ "${FLIP_STATUS}" -eq "${VERIFIED_ROLLBACK_STATUS}" ] &&
    "${REMOTE_LOCK_RELEASE_SAFE}"; then
    # cleanup now has positive proof that current is back on the exact old,
    # healthy target. It may owner-check/remove this run's failed release and
    # release the host lock while preserving the deployment failure status.
    fail "the new release failed live health; the previous release was restored and verified"
  fi
  # Every other result includes a failed rollback proof or an ambiguous SSH
  # outcome. Retain both the release and host lock for operator inspection.
  REMOTE_LOCK_RELEASE_SAFE=false
  fail "the flip or live health transaction failed; retained the host lock for inspection"
fi
REMOTE_RELEASE_UNHEALTHY=false

# (f) Prune. Sorted by the UTC timestamp embedded after the commit sha. Directory
#     mtime is not authoritative because migration adds a self-link to old v1
#     releases. The symlink target is resolved first and skipped, so a rollback
#     that points current at an older release cannot delete its own target.
#
#     A release carrying the migration's `public -> .` self-symlink prunes
#     like any other: readlink -f on the release directory is the directory
#     itself, and rm -rf unlinks a symlink it meets rather than following it.
if remote_stream "pruning releases to the newest ${KEEP_RELEASES}" \
  "cat '${REPO_ROOT}/scripts/list-releases.mjs'" \
  "set -u
prune_tmp=\$(mktemp -d -- /tmp/posvoji-prune-${RELEASE_NAME}.XXXXXX) || exit 1
cleanup_prune() { rm -rf --one-file-system -- \"\$prune_tmp\"; }
trap cleanup_prune 0
trap 'exit 129' 1
trap 'exit 130' 2
trap 'exit 141' 13
trap 'exit 143' 15
cur=\$(readlink -f ${CURRENT_LINK}) || { echo 'could not resolve current for pruning' >&2; exit 1; }
cd ${RELEASES_DIR} || { echo 'could not enter the releases directory for pruning' >&2; exit 1; }
node - ${RELEASES_DIR} >\"\$prune_tmp/sorted\" || exit 1
tail -n +$((KEEP_RELEASES + 1)) \"\$prune_tmp/sorted\" >\"\$prune_tmp/candidates\" || exit 1
prune_failed=false
while IFS= read -r old; do
  [ -n \"\$old\" ] || continue
  [ -d \"\$old\" ] || continue
  resolved=\$(readlink -f -- \"\$old\") || { echo \"could not resolve \$old\" >&2; prune_failed=true; continue; }
  if [ \"\$resolved\" = \"\$cur\" ]; then
    echo \"keeping \$old, it is the current release\"
    continue
  fi
  mounted=\$(awk -v root=\"\$resolved\" '\$5 == root || index(\$5, root "/") == 1 { print \$5; exit }' /proc/self/mountinfo) || { echo \"could not inspect mounts under \$old\" >&2; prune_failed=true; continue; }
  if [ -n \"\$mounted\" ]; then
    echo \"refusing to prune \$old; it contains mountpoint \$mounted\" >&2
    prune_failed=true
    continue
  fi
  if rm -rf --one-file-system -- \"\$old\"; then
    echo \"pruned \$old\"
  else
    echo \"could not prune \$old\" >&2
    prune_failed=true
  fi
done <\"\$prune_tmp/candidates\"
\"\$prune_failed\" && exit 1
exit 0"; then
  :
elif "${REMOTE_LOCK_RELEASE_SAFE}"; then
  if "${WITHDRAWAL}"; then
    fail "the withdrawal release is live, but old-release pruning failed; withdrawal cleanup is incomplete"
  fi
  echo "  !! WARNING: the new release is live and healthy, but old-release pruning failed." >&2
  echo "  !! Retry the prune after reviewing the host; deployment remains successful." >&2
else
  fail "lost the SSH result while pruning; the new release is live but the deployment lock was retained"
fi

# --- summary -----------------------------------------------------------------

release_remote_lock ||
  fail "the new release is live, but ${DEPLOY_LOCK_DIR} could not be released"

stage "Summary"

info "commit:   ${HEAD_SHA12} (${HEAD_BRANCH})"
info "release:  ${RELEASE_NAME}"
info "artifact: ${ARTIFACT_SIZE}, ${ARTIFACT_FILES} files, media excluded"
if "${LAYOUT_V2}"; then
  info "layout:   v2, public/ plus private/ (both datasets and the receipt)"
else
  info "layout:   today's, no private artifacts (no ${LAYOUT_MARKER} on the host)"
fi

if "${DRY_RUN}"; then
  info "dry run: no connection was opened to ${REMOTE_HOST}"
else
  info "live at ${CURRENT_LINK} -> ${RELEASE_DIR}"
fi

echo
