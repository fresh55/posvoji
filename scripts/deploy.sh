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
  4. Deploy        media sync, release upload, health check, symlink flip, prune

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
#     This sync adds and overwrites; it never removes. The eventual goal is
#     `rsync -a --delete`, which is what actually mirrors the local sweep and
#     what the right-to-exit clause in DATA-POLICY.md depends on: a photo a
#     shelter took down has to stop being served, not just stop being linked.
#     Until rsync is on the host, a file that leaves the ingest machine stays
#     on the host until someone removes it by hand.
remote_stream "syncing media (add and overwrite only, no deletes)" \
  "tar -C '${LOCAL_MEDIA}' -cf - ." \
  "mkdir -p ${MEDIA_DIR} && tar -C ${MEDIA_DIR} -xf - --no-same-owner"

remote "fixing ownership and modes on the media directory" \
  "chown -R ${OWNERSHIP} ${MEDIA_DIR} && find ${MEDIA_DIR} -type d -exec chmod ${DIR_MODE} {} + && find ${MEDIA_DIR} -type f -exec chmod ${FILE_MODE} {} +"

remote "counting media files on the host" \
  "printf 'media files on host: ' && find ${MEDIA_DIR} -type f | wc -l"

# (b) The release directory.
remote_stream "uploading the release to ${RELEASE_DIR}" \
  "cat '${ARTIFACT}'" \
  "mkdir -p ${RELEASE_DIR} && tar -C ${RELEASE_DIR} -xzf - --no-same-owner"

remote "fixing ownership and modes on the release" \
  "chown ${OWNERSHIP} ${RELEASES_DIR} && chmod ${DIR_MODE} ${RELEASES_DIR} && chown -R ${OWNERSHIP} ${RELEASE_DIR} && find ${RELEASE_DIR} -type d -exec chmod ${DIR_MODE} {} + && find ${RELEASE_DIR} -type f -exec chmod ${FILE_MODE} {} +"

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
