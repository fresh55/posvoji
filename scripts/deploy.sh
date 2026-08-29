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
# Runs from Git Bash on Windows and from a POSIX shell on Linux or macOS. It
# needs git, tar, ssh and pnpm on PATH, plus cmd.exe on Windows for the media
# junction.
#
# Usage: see usage() below, or run with -h.

set -euo pipefail

# --- what production looks like ---------------------------------------------

REMOTE_USER="root"
REMOTE_HOST="116.203.202.17"
REMOTE="${REMOTE_USER}@${REMOTE_HOST}"

# The recovery key is the one that works unattended. BatchMode=yes makes ssh
# fail instead of prompting, which is what a script wants; it also means the
# host key has to be in known_hosts already, because ssh cannot ask about an
# unknown one in batch mode.
SSH_KEY="${HOME}/.ssh/posvoji_hetzner_recovery"

BASE_DIR="/srv/posvoji"
MEDIA_DIR="${BASE_DIR}/media"
RELEASES_DIR="${BASE_DIR}/releases"
CURRENT_LINK="${BASE_DIR}/current"

# Everything under /srv/posvoji: owned by the service user, readable by the
# web server's group, nothing readable by anyone else.
OWNERSHIP="posvoji:caddy"
DIR_MODE="750"
FILE_MODE="640"

# How many release directories to keep after a deploy, the new one included.
KEEP_RELEASES=3

# Backstop on the media orphan-delete step below, not the safeguard. What
# makes that step safe is the exact count check: the host is told how many
# lines the local file list should have and refuses to diff against a list
# that arrived short. This share is what is left over for anything that check
# cannot see, expressed against the size of the directory so it does not have
# to be retuned as the dataset grows. A flat ceiling had to be: it refused a
# routine cleanup of files left behind by ordinary adoptions.
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

DRY_RUN=false
ALLOW_DIRTY=false

# Set by the build stage, read by the cleanup trap.
TMP_ROOT=""
WORKTREE=""
MEDIA_LINK_KIND="none" # none, junction, symlink or copy

usage() {
  cat <<'USAGE'
Usage: scripts/deploy.sh [--dry-run] [--allow-dirty] [-h]

Builds apps/web at HEAD in a temporary git worktree and deploys the static
export to the production host as a new release.

  --dry-run       Do everything local: preflight, the full build, the artifact.
                  Print every remote command instead of running it. Opens no
                  connection to the host at all.
  --allow-dirty   Deploy with uncommitted changes in the working tree. The
                  build still happens at HEAD, so those changes do not reach
                  production; this only silences the abort.
  -h, --help      This text.

Stages:
  1. Preflight     clean tree, dataset present, media present, pnpm media:verify
  2. Build         git worktree at HEAD, pnpm install, pnpm --filter web build
  3. Artifact      tar of apps/web/out without media/ and without .br/.gz
  4. Deploy        media sync, orphan cleanup, host media verify, release
                   upload, health check, symlink flip, prune

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

# ssh from Git for Windows is an MSYS binary, so arguments starting with / are
# passed through as written rather than rewritten into C:\ paths. The env var
# is belt and braces in case that ever stops being true; it does nothing on a
# real POSIX system.
ssh_exec() {
  MSYS_NO_PATHCONV=1 ssh -i "${SSH_KEY}" -o BatchMode=yes "${REMOTE}" "$@"
}

# Run a command on the host, or print it when --dry-run is set.
remote() {
  local label="$1" cmd="$2"
  info "${label}"
  if "${DRY_RUN}"; then
    printf '  [dry-run] would run: ssh -i %s -o BatchMode=yes %s '\''\n' \
      "${SSH_KEY}" "${REMOTE}"
    printf '%s\n' "${cmd}" | sed 's/^/  [dry-run]     /'
    printf '  [dry-run] '\''\n'
    return 0
  fi
  ssh_exec "${cmd}"
}

# The chown/chmod incantation applied to both the media directory and each
# release directory: owner and group first, then directories and files get
# their own mode because they need different ones. Both call sites want
# exactly this for one directory, differing only in which directory.
own_and_mode_cmd() {
  local dir="$1"
  printf 'chown -R %s %s && find %s -type d -exec chmod %s {} + && find %s -type f -exec chmod %s {} +' \
    "${OWNERSHIP}" "${dir}" "${dir}" "${DIR_MODE}" "${dir}" "${FILE_MODE}"
}

# Same, but the remote command reads a tar stream from a local pipeline. The
# local side is passed as a string so the dry run can print the whole pipeline
# rather than half of it. Every path inside those strings is quoted, because
# on Windows they start with a drive letter and can contain spaces.
remote_stream() {
  local label="$1" local_pipeline="$2" cmd="$3"
  info "${label}"
  if "${DRY_RUN}"; then
    printf '  [dry-run] would run: %s \\\n' "${local_pipeline}"
    printf '  [dry-run]     | ssh -i %s -o BatchMode=yes %s '\''%s'\''\n' \
      "${SSH_KEY}" "${REMOTE}" "${cmd}"
    return 0
  fi
  eval "${local_pipeline}" | ssh_exec "${cmd}"
}

# --- cleanup -----------------------------------------------------------------

# Runs on every exit path, including a failed build. The media junction is
# removed before the worktree is, and with cmd's rmdir rather than rm, so that
# nothing can walk through the link and delete 270 MB of cached photos.
cleanup() {
  local status=$?
  if [ -n "${WORKTREE}" ] && [ -d "${WORKTREE}" ]; then
    stage "Cleanup"
    case "${MEDIA_LINK_KIND}" in
      junction)
        info "removing the media junction"
        cmd //c rmdir "$(cygpath -w "${WORKTREE}/apps/web/public/media")" \
          >/dev/null 2>&1 || true
        ;;
      symlink)
        info "removing the media symlink"
        rm -f "${WORKTREE}/apps/web/public/media" || true
        ;;
    esac
    info "removing the build worktree (this takes a moment, the export is large)"
    git -C "${REPO_ROOT}" worktree remove --force "${WORKTREE}" >/dev/null 2>&1 ||
      rm -rf "${WORKTREE}" || true
    git -C "${REPO_ROOT}" worktree prune >/dev/null 2>&1 || true
  fi
  if [ -n "${TMP_ROOT}" ] && [ -d "${TMP_ROOT}" ]; then
    rm -rf "${TMP_ROOT}" || true
  fi
  exit "${status}"
}

# --- arguments ---------------------------------------------------------------

while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=true ;;
    --allow-dirty) ALLOW_DIRTY=true ;;
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

cd "${REPO_ROOT}"

# --- stage 1: preflight ------------------------------------------------------

stage "Preflight"

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

# The photo-less build trap. `pnpm --filter web build` reads data/dist and
# copies whatever is in public/media; both are gitignored ingest output, and
# missing either produces a site with no photos that fails no check.
[ -f "${LOCAL_DIST}/animals.json" ] ||
  fail "no data/dist/animals.json. Run \`pnpm dataset:export\` first."
[ -d "${LOCAL_MEDIA}/animals" ] ||
  fail "no apps/web/public/media/animals. Run \`pnpm dataset:export\` first."
[ -n "$(ls -A "${LOCAL_MEDIA}/animals" 2>/dev/null)" ] ||
  fail "apps/web/public/media/animals is empty. Run \`pnpm dataset:export\` first."
info "dataset and media present"

info "verifying every media file the dataset references"
pnpm media:verify 2>&1 | sed 's/^/  /' ||
  fail "pnpm media:verify failed. Do not deploy on top of missing media."

if ! "${DRY_RUN}" && [ ! -f "${SSH_KEY}" ]; then
  fail "no ssh key at ${SSH_KEY}"
fi

RELEASE_NAME="${HEAD_SHA12}-$(date -u +%Y%m%dT%H%M%SZ)"
RELEASE_DIR="${RELEASES_DIR}/${RELEASE_NAME}"
info "release name: ${RELEASE_NAME}"

# --- stage 2: hermetic build -------------------------------------------------

stage "Build"

TMP_ROOT="$(mktemp -d)"
WORKTREE="${TMP_ROOT}/worktree"
ARTIFACT="${TMP_ROOT}/${RELEASE_NAME}.tar.gz"
trap cleanup EXIT INT TERM

info "worktree at ${WORKTREE}"
git worktree add --detach "${WORKTREE}" "${HEAD_SHA}" 2>&1 | sed 's/^/  /' ||
  fail "git worktree add failed"

# data/dist is build input, not repository content, so the worktree does not
# have it. It is a few megabytes of JSON, so a copy is fine.
info "copying data/dist into the worktree"
mkdir -p "${WORKTREE}/data"
cp -r "${LOCAL_DIST}" "${WORKTREE}/data/dist" || fail "could not copy data/dist"

# public/media is 270 MB and the export copies it wholesale, so link it in
# rather than copying it twice. A junction, not a symlink: it needs no
# developer mode or elevation on Windows. If that fails for any reason, fall
# back to the slow, always-correct copy.
info "linking apps/web/public/media into the worktree"
mkdir -p "${WORKTREE}/apps/web/public"
if command -v cygpath >/dev/null 2>&1 &&
  cmd //c mklink //J \
    "$(cygpath -w "${WORKTREE}/apps/web/public/media")" \
    "$(cygpath -w "${LOCAL_MEDIA}")" >/dev/null 2>&1; then
  MEDIA_LINK_KIND="junction"
  info "junction created"
elif ln -s "${LOCAL_MEDIA}" "${WORKTREE}/apps/web/public/media" 2>/dev/null; then
  MEDIA_LINK_KIND="symlink"
  info "symlink created"
else
  MEDIA_LINK_KIND="copy"
  info "no link possible, copying the whole media directory instead"
  cp -r "${LOCAL_MEDIA}" "${WORKTREE}/apps/web/public/media" ||
    fail "could not provide public/media to the build"
fi

info "pnpm install --frozen-lockfile"
(cd "${WORKTREE}" && pnpm install --frozen-lockfile) 2>&1 | sed 's/^/  /' ||
  fail "pnpm install failed in the worktree"

info "pnpm --filter web build"
(cd "${WORKTREE}" && pnpm --filter web build) 2>&1 | sed 's/^/  /' ||
  fail "the web build failed in the worktree"

OUT_DIR="${WORKTREE}/apps/web/out"
[ -s "${OUT_DIR}/index.html" ] ||
  fail "the build produced no ${OUT_DIR}/index.html"

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

info "artifact: ${ARTIFACT_SIZE}, ${ARTIFACT_FILES} files"
info "sample asset for the health check: ${SAMPLE_ASSET}"

# --- stage 4: deploy ---------------------------------------------------------

stage "Deploy"

if "${DRY_RUN}"; then
  info "--dry-run: printing the remote commands, running none of them"
fi

# (a) Media first, always. A release that goes live before its photos land
#     renders blank heroes and missing ladder rungs, and neither one shows up
#     anywhere except in front of a visitor. See docs/DEPLOY-MEDIA.md.
#
#     rsync is not on the Windows side of this script (Git Bash carries no
#     rsync binary), so this is a tar add-and-overwrite stream. It never
#     removes a file by itself; the list diff below does that instead.
remote_stream "syncing media (add and overwrite only, no deletes)" \
  "tar -C '${LOCAL_MEDIA}' -cf - ." \
  "mkdir -p ${MEDIA_DIR} && tar -C ${MEDIA_DIR} -xf - --no-same-owner"

remote "fixing ownership and modes on the media directory" \
  "$(own_and_mode_cmd "${MEDIA_DIR}")"

# (a2) Right to exit: a photo a shelter withdraws has to stop being served,
#      not just stop being linked from the dataset (see DATA-POLICY.md). The
#      tar sync above only adds and overwrites, so a file the ingest machine
#      no longer has would otherwise keep answering 200 on the host forever.
#      This sends the sorted local file list to the host and has it diff that
#      against its own sorted listing with comm, deleting exactly the
#      remote-only entries.
#
#      What the host must not do is delete against a list that arrived
#      incomplete, and a truncated list is not an empty one: a local find that
#      dies partway sends a short list that ends in a clean EOF, and every
#      name it never sent looks like a file the dataset dropped. So the count
#      is taken here and checked there. A short list is refused before the
#      diff, whatever its length, which is the thing a threshold could only
#      ever approximate. This step also prints the host's file count, which
#      it has to compute for the diff anyway.
LOCAL_MEDIA_LIST_CMD="cd '${LOCAL_MEDIA}' && find . -type f | sed 's|^\\./||' | LC_ALL=C sort"
LOCAL_MEDIA_COUNT="$(eval "${LOCAL_MEDIA_LIST_CMD}" | grep -c .)"
HOST_ORPHAN_DIFF_CMD="tmp_local=\$(mktemp)
tmp_remote=\$(mktemp)
cat >\"\${tmp_local}\"
local_count=\$(grep -c . <\"\${tmp_local}\")
if [ \"\${local_count}\" -ne ${LOCAL_MEDIA_COUNT} ]; then
  echo \"refusing to diff against a local media list of \${local_count} files where ${LOCAL_MEDIA_COUNT} were sent; it did not arrive whole, so nothing was deleted\" >&2
  rm -f \"\${tmp_local}\" \"\${tmp_remote}\"
  exit 1
fi
find ${MEDIA_DIR} -type f | sed 's|^${MEDIA_DIR}/||' | LC_ALL=C sort >\"\${tmp_remote}\"
remote_count=\$(grep -c . <\"\${tmp_remote}\")
echo \"media files on host: \${remote_count}\"
orphans=\$(comm -13 \"\${tmp_local}\" \"\${tmp_remote}\")
orphan_count=\$(printf '%s\\n' \"\${orphans}\" | grep -c .)
allowed=\$(( \${remote_count} * ${ORPHAN_DELETE_MAX_PERCENT} / 100 ))
if [ \"\${allowed}\" -lt ${ORPHAN_DELETE_MIN} ]; then allowed=${ORPHAN_DELETE_MIN}; fi
if [ \"\${orphan_count}\" -eq 0 ]; then
  echo 'no orphaned media files on the host'
elif [ \"\${orphan_count}\" -gt \"\${allowed}\" ]; then
  echo \"refusing to delete \${orphan_count} of the host's \${remote_count} media files, over the ${ORPHAN_DELETE_MAX_PERCENT} percent backstop (\${allowed}); nothing was deleted. The first of them:\" >&2
  printf '%s\\n' \"\${orphans}\" | head -20 >&2
  rm -f \"\${tmp_local}\" \"\${tmp_remote}\"
  exit 1
else
  printf '%s\\n' \"\${orphans}\" | sed \"s|^|${MEDIA_DIR}/|\" | tr '\\n' '\\0' | xargs -0 rm -f --
  echo \"removed \${orphan_count} orphaned media file(s) from the host\"
fi
rm -f \"\${tmp_local}\" \"\${tmp_remote}\""
remote_stream "removing media the host has that the dataset no longer references" \
  "${LOCAL_MEDIA_LIST_CMD}" "${HOST_ORPHAN_DIFF_CMD}"

# (a3) Verify the media the host now actually has, not the local directory
#      the build just read from (where a gap is nearly impossible). This is
#      the only check in the whole pipeline that can catch the exact failure
#      this script is organised around: a missing .avif renders a blank hero
#      with no fallback, and a missing ladder rung renders nothing, and
#      neither fails a build or the pre-flip health check below, which only
#      looks at index.html and one JS chunk. verify-media.mjs is Node
#      builtins only for exactly this: it can run on a host with nothing
#      installed. Ships the script plus the data/dist manifests it reads to a
#      throwaway directory on the host, runs it against the shared media
#      root, and aborts before the flip on a nonzero exit.
HOST_VERIFY_DIR="/tmp/posvoji-verify-${RELEASE_NAME}"
HOST_VERIFY_FILES="scripts/verify-media.mjs data/dist/animals.json"
for extra in data/dist/share-cards.json data/dist/shelter-logos.json; do
  if [ -f "${REPO_ROOT}/${extra}" ]; then
    HOST_VERIFY_FILES="${HOST_VERIFY_FILES} ${extra}"
  fi
done
remote_stream "shipping verify-media.mjs and the dist manifests to the host" \
  "tar -C '${REPO_ROOT}' -cf - ${HOST_VERIFY_FILES}" \
  "mkdir -p ${HOST_VERIFY_DIR} && tar -C ${HOST_VERIFY_DIR} -xf - --no-same-owner"

remote "verifying media on the host" \
  "node ${HOST_VERIFY_DIR}/scripts/verify-media.mjs ${MEDIA_DIR}
verify_status=\$?
rm -rf ${HOST_VERIFY_DIR}
exit \${verify_status}"

# (b) The release directory.
remote_stream "uploading the release to ${RELEASE_DIR}" \
  "cat '${ARTIFACT}'" \
  "mkdir -p ${RELEASE_DIR} && tar -C ${RELEASE_DIR} -xzf - --no-same-owner"

remote "fixing ownership and modes on the release" \
  "chown ${OWNERSHIP} ${RELEASES_DIR} && chmod ${DIR_MODE} ${RELEASES_DIR} && $(own_and_mode_cmd "${RELEASE_DIR}")"

# (c) Check the new directory before anything points at it. A release that
#     unpacked short is still invisible at this point; after the flip it is the
#     site.
remote "checking the new release before the flip" \
  "test -s ${RELEASE_DIR}/index.html || { echo 'index.html missing or empty' >&2; exit 1; }
test -s ${RELEASE_DIR}/${SAMPLE_ASSET} || { echo '${SAMPLE_ASSET} missing or empty' >&2; exit 1; }
echo 'release contents look complete'"

# (d) The flip. ln -sfn replaces the link in one operation, so no request ever
#     sees a missing current/.
remote "flipping ${CURRENT_LINK} to ${RELEASE_NAME}" \
  "ln -sfn ${RELEASE_DIR} ${CURRENT_LINK} && chown -h ${OWNERSHIP} ${CURRENT_LINK} && readlink ${CURRENT_LINK}"

# (e) What Caddy actually serves now, asked on the host so the answer does not
#     depend on DNS or on anything between here and there. 401 is a pass: the
#     site may be behind basic auth.
remote "asking the host what the site returns" \
  "status=\$(curl -skI --resolve posvoji.si:443:127.0.0.1 https://posvoji.si/ | head -1)
echo \"live response: \$status\"
case \"\$status\" in *' 200'*|*' 401'*) : ;; *) echo 'unexpected status after the flip' >&2; exit 1 ;; esac"

# (f) Prune. Sorted by mtime, not by name: a release name starts with the
#     commit sha, so sorting by name is sorting by nothing. The symlink target
#     is resolved first and skipped, so a rollback that points current at an
#     older release cannot delete the release it points at.
remote "pruning releases to the newest ${KEEP_RELEASES}" \
  "cur=\$(readlink -f ${CURRENT_LINK} || true)
cd ${RELEASES_DIR} || exit 0
ls -1t | tail -n +$((KEEP_RELEASES + 1)) | while read -r old; do
  [ -d \"\$old\" ] || continue
  if [ \"\$(readlink -f \"\$old\")\" = \"\$cur\" ]; then
    echo \"keeping \$old, it is the current release\"
    continue
  fi
  rm -rf -- \"\$old\" && echo \"pruned \$old\"
done"

# --- summary -----------------------------------------------------------------

stage "Summary"

info "commit:   ${HEAD_SHA12} (${HEAD_BRANCH})"
info "release:  ${RELEASE_NAME}"
info "artifact: ${ARTIFACT_SIZE}, ${ARTIFACT_FILES} files, media excluded"

if "${DRY_RUN}"; then
  info "dry run: no connection was opened to ${REMOTE_HOST}"
else
  info "live at ${CURRENT_LINK} -> ${RELEASE_DIR}"
fi

echo
