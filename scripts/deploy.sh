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
# artifacts at all, printing the migration steps as it goes.
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

# Created by the operator once the Caddy docroot already points at
# current/public and the site has been checked from there. Present means the
# host serves current/public and this script may ship private artifacts;
# absent means it still serves current/ and must not. See the release layout
# note in the header, and the migration steps this script prints while the
# marker is absent.
LAYOUT_MARKER="${BASE_DIR}/.layout-v2"

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
ASSUME_LAYOUT_V2=false

# Which layout this deploy ships, decided in stage 4 by asking the host for
# the marker. False until then, so nothing before that point can ship a
# private file by accident.
LAYOUT_V2=false

# Set by the build stage, read by the cleanup trap.
TMP_ROOT=""
WORKTREE=""
MEDIA_LINK_KIND="none" # none, junction, symlink or copy

usage() {
  cat <<'USAGE'
Usage: scripts/deploy.sh [--dry-run] [--allow-dirty] [--assume-layout-v2] [-h]

Builds apps/web at HEAD in a temporary git worktree and deploys the static
export to the production host as a new release.

  --dry-run       Do everything local: preflight, the full build, the artifact.
                  Print every remote command instead of running it. Opens no
                  connection to the host at all.
  --allow-dirty   Deploy with uncommitted changes in the working tree. The
                  build still happens at HEAD, so those changes do not reach
                  production; this only silences the abort.
  --assume-layout-v2
                  Dry runs only. A dry run opens no connection, so it cannot
                  read the host's layout marker; this prints the layout v2
                  commands instead of today's. A real deploy always asks the
                  host and refuses this flag.
  -h, --help      This text.

Stages:
  1. Preflight     clean tree, dataset present, media present, pnpm media:verify
  2. Build         git worktree at HEAD, pnpm install, pnpm --filter web build
  3. Artifact      tar of apps/web/out without media/ and without .br/.gz
  4. Deploy        media sync, orphan cleanup, host media verify, layout gate,
                   release upload, health check, symlink flip, prune

The layout gate reads /srv/posvoji/.layout-v2 on the host. Present, the
release ships public/ and private/ (both datasets plus publication.json);
absent, it ships today's layout and no private artifacts, and prints the
three steps that move the host onto the new one.

A layout v2 release is packaged only when animals.json, animals.crawled.json
and overrides.json all carry the same export run's generatedAt. The check
runs before anything is uploaded.

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

# (a4) The layout gate. Asked once, here, because everything below it changes
#      shape with the answer, and because a wrong answer in either direction
#      is a production incident: the new layout under the old docroot 404s the
#      site, the private datasets under the old docroot are downloadable.
#
#      The host answers with a word rather than an exit status, so a
#      connection that fails reads as a failure instead of as "no marker".
if "${DRY_RUN}"; then
  if "${ASSUME_LAYOUT_V2}"; then
    LAYOUT_V2=true
    info "--assume-layout-v2: printing the layout v2 commands"
  else
    info "not asking the host about ${LAYOUT_MARKER}; assuming today's layout"
  fi
else
  info "asking the host for ${LAYOUT_MARKER}"
  LAYOUT_ANSWER="$(ssh_exec "if [ -f ${LAYOUT_MARKER} ]; then echo v2; else echo v1; fi")" ||
    fail "could not ask the host about ${LAYOUT_MARKER}"
  case "${LAYOUT_ANSWER}" in
    *v2*) LAYOUT_V2=true ;;
    *v1*) LAYOUT_V2=false ;;
    *) fail "unexpected answer about ${LAYOUT_MARKER}: ${LAYOUT_ANSWER}" ;;
  esac
fi

# Where index.html goes inside the release, which is what the docroot points
# at. The two layouts differ in exactly this.
if "${LAYOUT_V2}"; then
  RELEASE_SITE_DIR="${RELEASE_DIR}/public"
  RELEASE_PRIVATE_DIR="${RELEASE_DIR}/private"
  info "layout v2: the release ships public/ and private/"
  # Checked before a byte is uploaded, so a release directory is never left
  # half built by a dataset that is not there.
  [ -f "${LOCAL_DIST}/animals.crawled.json" ] ||
    fail "no data/dist/animals.crawled.json. The host is on layout v2, which ships it. Run \`pnpm dataset:export\` first."

  # The private half is staged and checked here, before the release upload
  # below, rather than after it. animals.json, animals.crawled.json and
  # overrides.json carry one export run's generatedAt; a set that disagrees is
  # a run that stopped between its writes, and a release built out of it would
  # pair one run's site with another run's datasets. scripts/publication.cjs
  # refuses to write the receipt in that case and this deploy stops with
  # nothing uploaded. It carries the whole rule and its reasoning.
  PRIVATE_STAGE="${TMP_ROOT}/private"
  mkdir -p "${PRIVATE_STAGE}"
  cp "${LOCAL_DIST}/animals.crawled.json" "${PRIVATE_STAGE}/dataset.crawled.json" ||
    fail "could not stage dataset.crawled.json"
  cp "${LOCAL_DIST}/animals.json" "${PRIVATE_STAGE}/dataset.published.json" ||
    fail "could not stage dataset.published.json"

  info "checking the dataset generation and writing publication.json"
  node "${REPO_ROOT}/scripts/publication.cjs" \
    "${LOCAL_DIST}" "${RELEASE_NAME}" "${PRIVATE_STAGE}/publication.json" ||
    fail "the release was not packaged; nothing was uploaded"
  info "publication.json: $(tr -d '\n ' <"${PRIVATE_STAGE}/publication.json")"
else
  RELEASE_SITE_DIR="${RELEASE_DIR}"
  RELEASE_PRIVATE_DIR=""
  echo
  echo "  !! The host has no ${LAYOUT_MARKER}, so this deploy ships today's"
  echo "  !! layout and NO private artifacts. The datasets and the release"
  echo "  !! receipt are withheld: under the current docroot every file in"
  echo "  !! the release directory is downloadable, and private/ would be"
  echo "  !! too."
  echo "  !!"
  echo "  !! Migrating the host is three steps in this order, with the"
  echo "  !! scheduled crawl paused for all three (it deploys unattended, and"
  echo "  !! a release shipped between steps 1 and 3 has no public/ of its"
  echo "  !! own). The site answers normally between every pair of them, and"
  echo "  !! each step is reversible on its own:"
  echo "  !!"
  echo "  !!   1. Give every release that already exists a self-symlink, so"
  echo "  !!      each one is serveable at both <release> and <release>/public."
  echo "  !!      The block checks every release before it links anything, and"
  echo "  !!      stops if a real public/ directory is already there:"
  echo "  !!"
  echo "  !!        ("
  echo "  !!          set -e"
  echo "  !!          for r in ${RELEASES_DIR}/*/; do"
  echo "  !!            if [ -e \"\${r}public\" ] && [ ! -L \"\${r}public\" ]; then"
  echo "  !!              echo \"abort: \${r}public is a real directory\" >&2"
  echo "  !!              exit 1"
  echo "  !!            fi"
  echo "  !!          done"
  echo "  !!          for r in ${RELEASES_DIR}/*/; do"
  echo "  !!            ln -sfn . \"\${r}public\""
  echo "  !!            chown -h ${OWNERSHIP} \"\${r}public\""
  echo "  !!          done"
  echo "  !!        )"
  echo "  !!"
  echo "  !!      A real public/ directory is a layout v2 release that is"
  echo "  !!      already there, and it must not be linked over. The subshell"
  echo "  !!      keeps the abort out of your login shell. Nothing points at"
  echo "  !!      the new path yet, so no request changes. The block is"
  echo "  !!      idempotent; undo by deleting the links."
  echo "  !!   2. Move Caddy's docroot to ${CURRENT_LINK}/public, validate the"
  echo "  !!      config, then reload. The release current points at is still"
  echo "  !!      the one being served, now through its own self-symlink."
  echo "  !!      Before the reload:"
  echo "  !!"
  echo "  !!        test -s ${CURRENT_LINK}/public/index.html"
  echo "  !!        caddy validate --config /etc/caddy/Caddyfile"
  echo "  !!"
  echo "  !!      The config path differs per install; /etc/caddy/Caddyfile is"
  echo "  !!      the common default. Reload only after validate passes. The"
  echo "  !!      first check fails when a deploy landed after step 1, and"
  echo "  !!      re-running step 1's block fixes that. After the reload:"
  echo "  !!"
  echo "  !!        test -s ${CURRENT_LINK}/public/index.html"
  echo "  !!        curl -skI --resolve posvoji.si:443:127.0.0.1 https://posvoji.si/"
  echo "  !!"
  echo "  !!      Undo by putting the old docroot back."
  echo "  !!   3. touch ${LAYOUT_MARKER}. From here every deploy ships a real"
  echo "  !!      public/ and a private/ beside it, and the prune retires the"
  echo "  !!      self-linked releases as they age out. A rollback onto one of"
  echo "  !!      them keeps serving, because of step 1."
  echo
fi

# (b) The release directory.
remote_stream "uploading the release to ${RELEASE_SITE_DIR}" \
  "cat '${ARTIFACT}'" \
  "mkdir -p ${RELEASE_SITE_DIR} && tar -C ${RELEASE_SITE_DIR} -xzf - --no-same-owner"

# (b2) The private half of a layout v2 release: the two datasets and the
#      receipt that says which run produced them, all three staged and checked
#      at the layout gate above. Never uploaded under the old layout, and never
#      inside public/, because Caddy serves that directory and serves it whole.
if "${LAYOUT_V2}"; then
  remote_stream "uploading the private artifacts to ${RELEASE_PRIVATE_DIR}" \
    "tar -C '${PRIVATE_STAGE}' -cf - ." \
    "mkdir -p ${RELEASE_PRIVATE_DIR} && tar -C ${RELEASE_PRIVATE_DIR} -xf - --no-same-owner"
fi

# Recursive over the release root, so public/ and private/ are both covered by
# one pass in either layout: 750 on directories, 640 on files, owned by the
# service user and readable by Caddy's group. private/ is kept out of reach by
# where it sits, not by its mode.
remote "fixing ownership and modes on the release" \
  "chown ${OWNERSHIP} ${RELEASES_DIR} && chmod ${DIR_MODE} ${RELEASES_DIR} && $(own_and_mode_cmd "${RELEASE_DIR}")"

# (c) Check the new directory before anything points at it. A release that
#     unpacked short is still invisible at this point; after the flip it is the
#     site.
RELEASE_CHECK_CMD="test -s ${RELEASE_SITE_DIR}/index.html || { echo 'index.html missing or empty' >&2; exit 1; }
test -s ${RELEASE_SITE_DIR}/${SAMPLE_ASSET} || { echo '${SAMPLE_ASSET} missing or empty' >&2; exit 1; }"
if "${LAYOUT_V2}"; then
  # public/ has to be a real directory in a release this script just built.
  # The migration ritual printed under the old layout gives every pre-existing
  # release a `public -> .` self-symlink so it can be served from the moved
  # docroot, and those releases are legitimate rollback targets; this check
  # never looks at one, because it only ever inspects the release of this run,
  # whose public/ was made by the mkdir above. Asserting it is a directory and
  # not a link is what keeps the two cases apart: `test -s public/index.html`
  # alone follows a self-symlink and would pass on a v1 release.
  RELEASE_CHECK_CMD="test -d ${RELEASE_SITE_DIR} && test ! -L ${RELEASE_SITE_DIR} || { echo 'public/ is not a real directory in this release' >&2; exit 1; }
${RELEASE_CHECK_CMD}
for f in dataset.crawled.json dataset.published.json publication.json; do
  test -s ${RELEASE_PRIVATE_DIR}/\$f || { echo \"private/\$f missing or empty\" >&2; exit 1; }
done
test ! -e ${RELEASE_SITE_DIR}/private || { echo 'private/ ended up inside the docroot' >&2; exit 1; }"
fi
remote "checking the new release before the flip" \
  "${RELEASE_CHECK_CMD}
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
#
#     A release carrying the migration's `public -> .` self-symlink prunes
#     like any other: readlink -f on the release directory is the directory
#     itself, and rm -rf unlinks a symlink it meets rather than following it.
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
