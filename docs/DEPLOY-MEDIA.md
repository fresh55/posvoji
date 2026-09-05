# Deploy: the media lifecycle

For exact HTTPS release verification, generation ordering, local host execution
and the immediate withdrawal/prune procedure, see
[PRODUCTION-OPERATIONS.md](PRODUCTION-OPERATIONS.md). Deploy now rejects a 401
as a health result and verifies the expected homepage and release status bytes.

`apps/web/public/media/` is not repository content. It is written by
`apps/ingest` and is gitignored, along with `data/dist/`. A release-symlink
deploy has to account for that separately from the build itself: the files
have to exist before the build runs, and in production they should not travel
inside the release artifact at all.

## What writes the media directories

| Directory | Written by | Naming |
|---|---|---|
| `public/media/animals/` | `pnpm dataset:export`, `pnpm images:derive` | content hash |
| `public/media/shelter-logos/` | `pnpm dataset:export`, `pnpm logos:fetch` | content hash |
| `public/media/share/` | `pnpm dataset:export` only | stable id-derived name |

**`animals/`** (`apps/ingest/src/cache-images.ts`). The cached copy of a
photo is named `<sha256-16>.webp`, and its derivatives sit beside it under the
same hash: `<hash>.thumb.webp`, `<hash>-<width>.webp` for each ladder rung
(320/480/640px, skipping any rung at or above the photo's own width), and
`<hash>.avif` for an animal's first (hero) image. A re-encoded or replaced
source photo gets a new hash, so a master never changes its bytes under an
existing name. Its derivatives can: they are named for the master's hash, and
a `DERIVATIVE_VERSION` bump in `cache-images.ts` re-cuts all of them from the
masters already on disk, under the same names and without a single request.
`dataset:export` fetches, encodes and derives in one pass; `images:derive`
only derives (thumb, rungs, blur placeholder, hero avif) from photos already
on disk, without any network request, which is what a schema-only change or a
version bump needs.

**`shelter-logos/`** (`apps/ingest/src/cache-logos.ts`). Same scheme:
`<sha256-16>.webp`, content-hashed, so a redesigned logo gets a new name. Tiny
relative to the other two directories, since it holds at most one file per
shelter.

**`share/`** (`apps/ingest/src/share-cards.ts`). A bounded, filesystem-safe
stem of the animal id is followed by a 16-hex SHA-256 digest of the complete
id, preventing sanitized-id collisions. Photo cards use `<stem>-<digest>.jpg`;
typographic cards add `.sl` or `.en` before `.jpg`. The name is stable for an
id rather than content-addressed, so the same filename points at different
bytes when an animal's name, status or photo changes. Cards are only drawn by
`dataset:export`, since drawing one needs a cached photo from `animals/` to
composite.

Each directory's cache-control needs follow directly from this: content-hash
names are safe to cache forever, stable id-derived names are not. See
[DEPLOY-HEADERS.md](DEPLOY-HEADERS.md) for the actual headers.

`data/dist/*.json` sits next to these. `animals.json` is the dataset the site
reads: the crawl with the portal's shelter corrections merged in.
`animals.crawled.json` is the same run's records before any correction was
merged, and it is what the next run reuses, carries `firstSeenAt` from and
guards removals against; the site never reads it. Keeping the two apart is
what stops a correction from being read back on the next run as something the
shelter's own page said (`apps/ingest/src/crawled-snapshot.ts`).
`image-cache.json`, `shelter-logos.json`, `share-cards.json` are the manifests
that record what has already been fetched or drawn, and `overrides.json` is
the audit trail of the corrections. The manifests are what let a re-run skip
work that is still valid; none of these are served to visitors.

`generation.json` is different: it is the last atomic write of a successful
export. Its generation id is derived from SHA-256 digests of the five JSON
files deployment consumes (`animals.json`, `animals.crawled.json`,
`overrides.json`, `share-cards.json`, `shelter-logos.json`), the auxiliary
`image-cache.json` consumed by standalone derivation, and every media byte
referenced by the public snapshot. A stale receipt cannot bless a partial run,
including a share card whose stable filename was overwritten with new bytes.
`images:derive` and `logos:fetch` validate the prior receipt before changing
their slice and write a replacement only after their writes finish. They may
repair only a receipt-named file that is absent and that the job itself can
recreate: an image derivative (never a master photo) or a shelter logo. Empty
or changed bytes, stale JSON and inconsistencies outside that exact slice stay
fail-closed. Only a complete `dataset:export` may establish a missing receipt.

## Deploying

```bash
bash scripts/deploy.sh --dry-run   # everything local, prints the remote commands
bash scripts/deploy.sh --dry-run --assume-layout-v2  # preview the post-migration layout
bash scripts/deploy.sh             # the real thing
```

`scripts/deploy.sh` is the deploy path. It does the whole sequence below in
order, and the order is the point: the media has to be on the host before any
release that references it is live. Everything it needs is in the script, so
nothing here has to be run by hand.

`--dry-run` runs the preflight, the full build and the artifact packing, then
prints every remote command it would run instead of running it. It opens no
connection to the host, so by default it cannot see the layout marker and
previews the v1 layout. After migration, add `--assume-layout-v2` to exercise
the private-artifact staging and generation checks and to see what production
would ship.

### Requirements

The deploy machine needs Bash, Node 22+, pnpm, Git, tar and OpenSSH. On Windows,
use Git Bash and keep both `cmd.exe` (to create the media junction) and
PowerShell (to prove cleanup detached it) available. The recovery key configured
in `deploy.sh` must exist, and the production host key must already be in
`known_hosts` because SSH runs in batch mode.

The host is Linux and needs a POSIX shell, Node 22+, curl, GNU tar, awk, sed, grep,
comm, a readable `/proc/self/mountinfo`, GNU findutils and GNU coreutils. GNU
`find -printf`, `mv -T`, `rm --one-file-system` and `tail` are used by the
guarded cleanup, prune and atomic live-link replacement; tar must support
`--no-same-owner` and `--no-same-permissions`. The `posvoji` user,
`caddy` group, Caddy service, enabled Caddy admin API (normally loopback port
2019) and a certificate valid for `posvoji.si` must already exist;
authenticated loopback checks keep certificate verification enabled. Migration
also needs the production Basic Auth pair. The commands in this runbook assume
root on the host. Keep enough free space for one complete temporary media
staging tree plus the new release. Temporary staging is removed after a
confirmed promotion; the new release remains live and is pruned only after it
ages out. `/srv/posvoji/media` must share a filesystem with the staging
directories under `/srv/posvoji`, and neither tree may contain a mountpoint;
preflight and promotion both enforce that requirement.

### What the script does

**Preflight.** Acquires the same checkout-local artifact lock used by ingest,
then aborts on a dirty working tree (`--allow-dirty` overrides, with
a warning: the build happens at HEAD either way, so uncommitted work is not
what goes out). Aborts if any of the six receipt-bound JSON inputs,
`generation.json`, or `apps/web/public/media` is missing. An empty referenced
set is valid (for example after all display permissions are withdrawn); the
mass-deletion guard still stops an unexpectedly large host cleanup for operator
review. Then runs `pnpm media:verify` and aborts if the receipt is malformed or
stale, or if any referenced media byte is absent or does not match its digest.
While the lock still holds, it copies the seven dist files and snapshots only
receipt-named media into its private temp directory, using same-volume hard
links and a copy fallback, then verifies that snapshot again. Producers publish
media by atomic replacement, so a hard link pins the verified old inode even
when a later ingest replaces the source name. The checkout lock is released at
that point. Build and upload children use only this immutable snapshot; even if
their parent shell is hard-killed, an orphan cannot keep reading mutable
checkout artifacts while the next ingest starts.

**Build.** Adds a detached `git worktree` at HEAD in a temp directory, copies
the snapshotted `data/dist` into it and links the snapshotted media tree in (a junction on
Windows, a symlink elsewhere, a copy if neither works), then runs
`pnpm install --frozen-lockfile` and `pnpm --filter web build` there. Building
in a worktree rather than in place is what makes the artifact correspond to a
commit instead of to whatever is currently in the editor. The worktree is
removed on every normal exit path, failures included. If a Windows junction
cannot be detached, cleanup preserves the whole temp directory and fails
loudly so no recursive delete can traverse into its sibling media snapshot.

**Artifact.** A gzipped tar of `apps/web/out`, excluding `./media` and any
`*.br`/`*.gz`. The media exclude is the whole point of the shared directory:
the export copies `public/media` into `out/`, and that copy must not travel
inside a release. The `.br`/`.gz` exclude is a guard only. `next build` emits
no precompressed siblings, so the ones in an older hand-made release came from
that deploy, not from the build, and the Caddyfile has no `precompressed`
directive to read them with anyway.

**Deploy**, in this order:

Before mutating the host, the script atomically creates
`/srv/posvoji/.deploy-lock` and records the unique release name in its `owner`
file. The lock spans layout selection, media sync, upload, flip, health check
and prune, excluding scheduled, manual and cross-clone deploys alike. Cleanup
removes a lock it owns only after SSH has confirmed that the last remote
command finished. A killed client or ambiguous transport result leaves the
lock fail-closed; the next deploy prints the owner. Confirm that run is dead
and inspect `current` before removing the stale directory.

1. Validate `generation.json` against every deploy-consumed generated JSON file
   and referenced media byte. Then read the layout marker and, for v2, stage
   the private release inputs from the same immutable worktree snapshot used by
   the build. A missing, malformed or stale receipt stops before any host
   content changes.
2. Derive a publication allowlist from the immutable dataset and manifests, then
   stream only those referenced media files into a uniquely owned host staging
   directory. A stale local cache file is never uploaded or treated as desired.
   Reject empty or unexpected entries, reject a mount at or below either
   staging or live media, and prove each destination directory is on the
   staging device before the first move. Then atomically rename each complete
   file over its live counterpart. An interrupted stream never truncates a file
   Caddy is serving. Normalize ownership/modes and print a file count.
3. Orphan cleanup: delete media on the host that the local dataset no longer
   references. See "Deleting withdrawn media" below.
4. `scripts/verify-media.mjs`, its media-reference and generation-receipt
   helpers, and the complete receipt-bound JSON set are shipped to a throwaway
   root-owned mode-700 directory on the host. A 077 umask and tar's
   `--no-same-permissions` keep every extracted input inaccessible to group and
   other users while it is run against `/srv/posvoji/media`; a nonzero result
   aborts before the flip. See "Verify before flipping the symlink" below.
5. A unique `.staging` release directory receives the artifact and, under
   layout v2, the two datasets plus `publication.json` beside it in
   `private/`. It receives its final
   `<sha12>-<UTC stamp>-<random nonce>` name only after upload and structural
   checks pass, through an atomic same-filesystem rename, so a partial upload
   cannot be counted as a rollback release. Its `.deploy-owner` marker follows
   the rename, excludes the directory from prune, and is removed only after the
   live health check passes. Cleanup deletes only a marker owned by this run.
6. A health check of the new directory while nothing points at it yet:
   `index.html` exists and is nonempty, and so does one hashed asset taken
   from the artifact listing. Under layout v2 the three private files are
   checked too, and neither `private/` nor any private-artifact filename may
   appear inside `public/`.
7. Create and chown a sibling symlink, then use GNU `mv -Tf` to rename it over
   `/srv/posvoji/current`. The same-filesystem rename is atomic, so a request
   sees either the old link or the new one, never a missing `current/`.
8. In the same remote transaction, request the site directly through loopback,
   expecting 200 or 401. A failed request restores the old link before the
   deploy exits non-zero. The EXIT rollback must then read back the exact saved
   link and receive 200 or 401 from that restored target. Only that fully
   verified rollback returns a distinct status to the client, allowing
   owner-checked removal of the failed release and host-lock release. A failed
   proof or ambiguous SSH result keeps both fail-closed for inspection. Only a
   successful new release proceeds to prune.
9. Best-effort prune to the newest three recognized releases, sorted by the UTC
   timestamp embedded in each release name, plus `current` when it points at an
   older recognized release. Directory mtime is deliberately ignored because
   migration adds a self-link to old releases. The exception can retain a fourth
   release so a rollback cannot delete the one it points at. A release directory
   is pruned whole, `private/` included. A
   confirmed prune-command failure warns for manual retry without turning a
   healthy deployment into a failed one. An ambiguous SSH result retains the
   lock and fails the run because the remote command may still be active.

The live-link rollback covers versioned HTML and private release data, not the
shared media tree. Orphan deletion happens before the flip and is deliberately
not undone: a withdrawn photo must stay withdrawn. An older HTML release may
therefore refer to media that no longer exists after a rollback.

The shared media tree, releases directory and each completed release are
normalized to `posvoji:caddy`, with directories `750` and files `640`. The
base directory, marker and temporary lock/staging paths are control state and
are not covered by that recursive ownership claim.

## Production layout: media outside the release

A release-symlink deploy makes a fresh directory per release and flips a
symlink (`/srv/posvoji/current`) to point at it once the build succeeds.
Shipping the large media tree inside that per-release directory means copying
it on every deploy for files that mostly have not changed.

Keep media in one shared directory on the host, outside every release:

```
/srv/posvoji/
  media/                 <- shared, never inside a release
    animals/
    shelter-logos/
    share/
  releases/
    a1b2c3d4e5f6-20260827T100000Z-0123456789abcdef/
      <the static export, no media/ under public/>
    f6e5d4c3b2a1-20260828T093000Z-fedcba9876543210/
  current -> releases/f6e5d4c3b2a1-20260828T093000Z-fedcba9876543210
```

The release name is the commit sha, UTC deploy time and a random 16-hex nonce.
The first two identify the source and time; the nonce prevents two clones that
start the same commit in the same second from sharing a directory or lock
identity.

## Release layout: the .layout-v2 gate

A release directory has two shapes, and the host picks which one it gets:

```
releases/<name>/            today: the release directory is the docroot
  index.html
  _next/...

releases/<name>/            layout v2
  public/                   the same export, and what the docroot points at
    index.html
  private/                  outside the docroot, never served
    dataset.crawled.json    animals.crawled.json, what the crawl said
    dataset.published.json  animals.json, what the site shipped
    publication.json        releaseId, generationId, datasetGeneratedAt,
                             overridesEnabled, and portalGeneratedAt when on
```

`publication.json` is the deploy receipt written by `scripts/publication.cjs`:
the release id only exists at deploy time. It carries the already-validated
ingest `generationId` from `data/dist/generation.json`; it is not the ingest
generation receipt itself. With the portal off, `portalGeneratedAt` is left out
rather than filled with the run's own clock.

The gate is the marker file `/srv/posvoji/.layout-v2`. `deploy.sh` reads it
over SSH on every deploy and needs no flag. This is not ceremony: the scheduled
crawl runs `deploy.sh` unattended every 12 hours from a clone it hard-resets to
`origin/main`, so whichever half of the migration lands first has to be
survivable. Layout v2 under the old docroot 404s the whole site; private files
under the old docroot are downloadable. With the marker absent the script ships
today's layout, withholds the private artifacts entirely, and points to the
operator runbook below.

### Moving the host onto layout v2

Three steps, in this order. The site answers normally between every pair of
them and each step is reversible on its own.

Pause the scheduled crawl first and resume it only once the verification below
passes ([CRAWL-SCHEDULING.md](CRAWL-SCHEDULING.md) asks for that before any hand
change to production anyway). From an elevated PowerShell, disable it and wait
until an in-flight run has actually finished:

```powershell
Disable-ScheduledTask -TaskName PosvojiCrawlDeploy -TaskPath \Posvoji\
while ((Get-ScheduledTask -TaskName PosvojiCrawlDeploy -TaskPath \Posvoji\).State -eq 'Running') {
  Start-Sleep -Seconds 2
}
if ((Get-ScheduledTask -TaskName PosvojiCrawlDeploy -TaskPath \Posvoji\).State -ne 'Disabled') {
  throw 'PosvojiCrawlDeploy is not disabled'
}
```

Then acquire the same host lock used by `deploy.sh`. Keep it in place through
steps 1–3; if the session stops midway, the lock intentionally remains and
prevents a deploy from interleaving with a half-finished migration:

```bash
(
  set -eu
  lock=/srv/posvoji/.deploy-lock
  owner=layout-v2-migration
  if mkdir "$lock"; then
    printf '%s\n' "$owner" >"$lock/owner" || {
      rm -f "$lock/owner"
      rmdir "$lock"
      exit 1
    }
  else
    echo "migration lock unavailable; current owner: $(cat "$lock/owner" 2>/dev/null || echo unknown)" >&2
    exit 1
  fi
  echo "migration lock: OK"
)
```

Every migration block below verifies that owner before changing anything. A
deploy cannot land between the release self-links, live Caddy reload and marker
creation; the lock is released explicitly only after all three agree. After an
interrupted session, inspect `current`, the Caddy config and the marker. If the
owner is still exactly `layout-v2-migration`, resume the idempotent numbered
blocks under that lock; do not delete and reacquire it blindly.

**1. Give every existing release a self-symlink.** On the host:

```bash
(
  set -eu
  test "$(cat /srv/posvoji/.deploy-lock/owner)" = layout-v2-migration || {
    echo "layout migration does not own the deploy lock" >&2
    exit 1
  }
  release_list="$(mktemp)"
  trap 'rm -f "$release_list"' EXIT
  find /srv/posvoji/releases -regextype posix-extended -mindepth 1 -maxdepth 1 \
    -type d \
    -regex '/srv/posvoji/releases/[0-9a-f]{12}-[0-9]{8}T[0-9]{6}Z(-[0-9a-f]{16})?' \
    -printf '%p/\n' >"$release_list"
  test -s "$release_list" || {
    echo "no completed release directories found" >&2
    exit 1
  }
  while IFS= read -r r; do
    if [ -L "${r}public" ]; then
      test "$(readlink "${r}public")" = . || {
        echo "abort: ${r}public is not a self-symlink" >&2
        exit 1
      }
    elif [ -e "${r}public" ]; then
      echo "abort: ${r}public is a real path" >&2
      exit 1
    fi
  done <"$release_list"
  while IFS= read -r r; do
    if [ ! -L "${r}public" ]; then
      ln -s . "${r}public"
    fi
    chown -h posvoji:caddy "${r}public"
  done <"$release_list"
  echo "release self-links: OK"
)
```

The first pass checks every release before the second links anything. A real
`public/` path is a layout v2 release that is already there, and a symlink to
anything except `.` is not the migration self-link; either one stops the run
with nothing changed. Existing correct links are left in place, so an
idempotent rerun never unlinks the path a request may be traversing. The
subshell keeps the abort out of your login shell.

Each v1 release is now serveable at both `<release>` and `<release>/public`,
because the link resolves back to the release root and Caddy's `file_server`
follows symlinks. Nothing points at the new path yet, so no request changes.
The block is idempotent, and undoing it is deleting the links.

**2. Move Caddy's docroot to `/srv/posvoji/current/public`, validate the config,
then reload it through Caddy's admin API.** The release `current` points at is
still the one being served, now through its own self-symlink. First copy the
repository's structural validator from the deploy checkout to the host:

```bash
scp scripts/validate-caddy-layout.cjs \
  root@YOUR_PRODUCTION_HOST:/tmp/posvoji-validate-caddy-layout.cjs
```

Replace `YOUR_PRODUCTION_HOST`, then on the host run:

```bash
(
  set -eu
  test "$(cat /srv/posvoji/.deploy-lock/owner)" = layout-v2-migration || {
    echo "layout migration does not own the deploy lock" >&2
    exit 1
  }
  test -s /srv/posvoji/current/public/index.html
  config=/etc/caddy/Caddyfile
  validator=/tmp/posvoji-validate-caddy-layout.cjs
  expected="$(mktemp)"
  active="$(mktemp)"
  cleanup_config_check() { rm -f "$expected" "$active" "$validator"; }
  trap cleanup_config_check EXIT
  trap 'exit 129' HUP
  trap 'exit 130' INT
  trap 'exit 143' TERM
  caddy validate --config "$config" --adapter caddyfile
  caddy adapt --config "$config" --adapter caddyfile >"$expected"
  caddy reload --config "$config" --adapter caddyfile
  curl --disable -fsS --noproxy '*' --connect-timeout 2 --max-time 5 \
    http://127.0.0.1:2019/config/ >"$active"
  node -e '
    const fs = require("node:fs");
    const { isDeepStrictEqual } = require("node:util");
    const expected = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    const active = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
    if (!isDeepStrictEqual(active, expected)) {
      console.error("active Caddy config does not match the validated file");
      process.exit(1);
    }
  ' "$expected" "$active"
  node "$validator" \
    --host posvoji.si \
    --root /srv/posvoji/current/public \
    --require-route '/media/*=/srv/posvoji/media' \
    --require-clean-html \
    --forbid-root /srv/posvoji/current \
    "$active"
  echo "active Caddy config: OK"
)
```

The config path differs per install; `/etc/caddy/Caddyfile` is the common
default. `caddy reload` applies the file to the running server through the admin
API; the following GET and deep structural comparison prove the active JSON is
the validated file, rather than merely trusting a successful file edit. The
repository validator follows effective route roots and reachability for the
`posvoji.si` host. It requires an unconditional public file server at
`/srv/posvoji/current/public`, the `.html`-first clean-URL rewrite in front of
it, and an otherwise-unconstrained `/media/*` file server rooted at
`/srv/posvoji/media` after stripping the `/media` prefix. An earlier terminal
response cannot impersonate either file server, and the clean rewrite must
check the same effective public root the file server uses. It also rejects the
old `/srv/posvoji/current` root even when it is inherited. If the admin endpoint
has a nondefault address, pass that same
address to `caddy reload` and the GET; if it is disabled, stop here and establish
an equivalent active-config proof before creating the marker. The file test
confirms that the intended path resolves and catches a release that was not
self-linked. Then verify the served site:

```bash
(
  set -eu
  test "$(cat /srv/posvoji/.deploy-lock/owner)" = layout-v2-migration || {
    echo "layout migration does not own the deploy lock" >&2
    exit 1
  }
  test -s /srv/posvoji/current/public/index.html
  umask 077
  netrc="$(mktemp)"
  trap 'rm -f "$netrc"' EXIT
  trap 'exit 129' HUP
  trap 'exit 130' INT
  trap 'exit 143' TERM
  cat >"$netrc" <<'NETRC'
machine posvoji.si login BASIC_AUTH_USER password BASIC_AUTH_PASSWORD
NETRC
  for path in / /viri; do
    code="$(curl --disable -sS -o /dev/null -w '%{http_code}' \
      --noproxy '*' --connect-timeout 5 --max-time 15 \
      --netrc-file "$netrc" --resolve posvoji.si:443:127.0.0.1 \
      "https://posvoji.si$path")"
    test "$code" = 200 ||
      { echo "the reloaded $path answered $code, expected 200" >&2; exit 1; }
  done
  echo "reloaded site: OK"
)
```

Replace the two Basic Auth placeholders before running the block. The file test
only proves that the intended path resolves on disk; the authenticated 200
proves Caddy still serves the site after the reload. An unauthenticated 401
would be inconclusive because Basic Auth runs before the file lookup. Undo by
putting the old docroot back and reloading.

**3. Create `/srv/posvoji/.layout-v2`, then release the migration lock.** On
the host:

```bash
(
  set -eu
  lock=/srv/posvoji/.deploy-lock
  owner=layout-v2-migration
  test "$(cat "$lock/owner")" = "$owner" || {
    echo "layout migration does not own the deploy lock" >&2
    exit 1
  }
  touch /srv/posvoji/.layout-v2
  rm -f "$lock/owner"
  if ! rmdir "$lock"; then
    printf '%s\n' "$owner" >"$lock/owner" || true
    echo "layout marker exists, but the migration lock could not be released" >&2
    exit 1
  fi
  echo "layout marker and lock release: OK"
)
```

From here every deploy ships a real `public/` with a `private/` beside it. The
prune retires the self-linked releases as they age out, and a rollback onto one
of them keeps serving, because of step 1. A release carrying the self-symlink
prunes like any other: `readlink -f` on the release directory is the directory
itself, the mount-table guard rejects mounted subtrees, and
`rm -rf --one-file-system` unlinks a symlink it meets rather than following it.

The order is what avoids an outage. Creating the marker first ships layout v2
into a docroot that has no `public/`, and moving the docroot first points it
at a path no existing release has: either one 404s the whole site until the
other half lands. Step 1 makes the new path valid for the releases that
already exist, which is what lets the two halves be done separately.

`deploy.sh`'s own pre-flip check asserts that the release it just built has a
real `public/` directory rather than a symlink, so a self-linked v1 release
can never be mistaken for a v2 one. It only ever inspects the release of the
run it is in, so the self-links from step 1 are never in its way.

#### Verifying the migration

Run one deploy by hand once the marker exists, then verify. That deploy is the
first release with a real `public/` and a `private/` beside it, and until it is
there the checks below describe nothing. The scheduled task stays disabled for
all of this.

Production is behind HTTP Basic Auth, so every unauthenticated request gets a
401, including a request for a path that does not exist. Fetching
`/private/dataset.published.json` without credentials and seeing a 401 says
nothing about whether the file is reachable: 401 comes back either way, and a
404 is never reached to be seen. This is also why `deploy.sh`'s own post-flip
check accepts 200 or 401. The structural checks below need no credentials and
are exact; the HTTP checks need credentials to mean anything.

Each verification subshell below runs under `set -eu` and asserts what it
checks, so a failed check exits non-zero and the subshell stops there. Each one
ends with a single pass line that is only reachable when everything in it
passed. That line is the pass, not the absence of alarming output: a subshell
that printed some of its output and stopped is a failure, and so is one that
exited non-zero after printing nothing.

**Structural checks.** On the host:

```bash
(
  set -eu
  marker=/srv/posvoji/.layout-v2
  cur=/srv/posvoji/current
  test -f "$marker" || { echo "layout marker is missing: $marker" >&2; exit 1; }
  test -L "$cur" || { echo "current is not a symlink" >&2; exit 1; }
  test -d "$cur/public" || { echo "public/ is not a directory" >&2; exit 1; }
  test ! -L "$cur/public" ||
    { echo "public/ is a symlink, so this is a v1 release" >&2; exit 1; }
  test -s "$cur/public/index.html" ||
    { echo "public/index.html is missing or empty" >&2; exit 1; }
  for f in dataset.crawled.json dataset.published.json publication.json; do
    test -s "$cur/private/$f" || { echo "missing: private/$f" >&2; exit 1; }
    test ! -e "$cur/public/$f" && test ! -L "$cur/public/$f" ||
      { echo "private artifact is inside the docroot: public/$f" >&2; exit 1; }
  done
  test ! -e "$cur/public/private" && test ! -L "$cur/public/private" ||
    { echo "private/ is inside the docroot" >&2; exit 1; }
  echo "structural checks: OK"
)
```

`structural checks: OK` is the pass. The directory-and-symlink checks are what
separate a real v2 release from a self-linked v1 one. A plain
`test -s public/index.html` follows the self-symlink and passes on both. The
marker check protects the next unattended deploy, while the `! -L` checks also
reject dangling links that `! -e` alone would miss. These are the same release
shape and privacy assertions `deploy.sh` makes before every flip.

The receipt names the release it was written for, so it has to agree with what
`current` points at:

```bash
(
  set -eu
  receipt=/srv/posvoji/current/private/publication.json
  cur="$(basename "$(readlink /srv/posvoji/current)")"
  rid="$(sed -n 's/.*"releaseId"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$receipt")"
  echo "current:   $cur"
  echo "releaseId: $rid"
  test "$cur" = "$rid" ||
    { echo "the receipt names $rid, current points at $cur" >&2; exit 1; }
  echo "receipt check: OK"
)
```

The block exits non-zero when the release directory and the receipt inside it
disagree, because that means the private half is not the one that deploy built.

**Authenticated HTTP checks.** Through Caddy, from the host. The credentials go
into a temporary `.netrc` that curl reads, so they stay off the command line,
out of the process list and out of curl's own output:

```bash
(
  set -eu
  umask 077
  netrc="$(mktemp)"
  trap 'rm -f "$netrc"' EXIT
  trap 'exit 129' HUP
  trap 'exit 130' INT
  trap 'exit 143' TERM
  cat >"$netrc" <<'NETRC'
machine posvoji.si login BASIC_AUTH_USER password BASIC_AUTH_PASSWORD
NETRC
  for pair in \
    "/ 200" \
    "/viri 200" \
    "/private/dataset.crawled.json 404" \
    "/private/dataset.published.json 404" \
    "/private/publication.json 404"
  do
    p="${pair% *}"
    want="${pair##* }"
    code="$(curl --disable -sS -o /dev/null -w '%{http_code}' \
      --noproxy '*' --connect-timeout 5 --max-time 15 \
      --netrc-file "$netrc" --resolve posvoji.si:443:127.0.0.1 \
      "https://posvoji.si$p")"
    echo "$code $p"
    test "$code" != 401 ||
      { echo "401 on $p: the credentials did not apply, so this run is inconclusive" >&2
        exit 1; }
    test "$code" = "$want" || { echo "$p answered $code, expected $want" >&2; exit 1; }
  done
  echo "authenticated HTTP checks: OK"
)
```

`BASIC_AUTH_USER` and `BASIC_AUTH_PASSWORD` are placeholders for the real pair.
`umask 077` is what keeps the file unreadable to anyone else while it exists.
The `trap` is installed straight after `mktemp` and before the credentials are
written, and it is what removes the file on every path out of the block: the
normal end, a failed check, a disconnect and an interrupt. A plain `rm -f` at
the bottom would only cover the first of those. The signal traps exit with the
conventional status, which then runs the EXIT cleanup once; a handler that only
removes the file would let the shell resume after an interrupt. `--disable`
ignores user curl configuration, `--noproxy '*'` prevents a configured proxy
from receiving the credentials, and certificate verification stays enabled for
the direct loopback request. A heredoc typed at the prompt still reaches the
shell history, so either put the line in the file with an editor or paste the
block with a leading space on a shell that has `HISTCONTROL=ignorespace`.

The expected codes are asserted rather than printed for reading: 200 for `/`
and the clean non-root route `/viri`,
and 404 for each real private-artifact URL:
`/private/dataset.crawled.json`, `/private/dataset.published.json` and
`/private/publication.json`. Anything else fails the block. A 401 fails it with
its own message, because it means the credentials did not apply and the run
then proves nothing: it is inconclusive, not a pass. Fix the credentials and
run it again.

**The rollback drill.** Once, at migration time. A rollback onto a self-linked
v1 release is what step 1 exists for, and doing it is the only way to know it
works. The scheduled task has to stay disabled for the drill: a crawl deploy
landing in the middle of it flips `current` underneath you.

```bash
ls -ld /srv/posvoji/releases/*/public   # the v1 ones are symlinks
```

```bash
(
  set -eu
  current=/srv/posvoji/current
  releases=/srv/posvoji/releases
  v1="$releases/PICK-A-V1-RELEASE"
  test -f /srv/posvoji/.layout-v2 ||
    { echo "layout v2 marker is missing" >&2; exit 1; }
  test -L "$v1/public" ||
    { echo "$v1/public is not a symlink" >&2; exit 1; }
  test "$(readlink "$v1/public")" = . ||
    { echo "$v1/public is not the migration self-symlink" >&2; exit 1; }
  test -s "$v1/public/index.html" ||
    { echo "$v1 has no nonempty index.html" >&2; exit 1; }
  v2="$(readlink -f "$current")"
  case "$v2" in
    "$releases"/*) ;;
    *) echo "current points outside $releases: $v2" >&2; exit 1 ;;
  esac
  test -d "$v2/public" && test ! -L "$v2/public" ||
    { echo "current is not a layout v2 release" >&2; exit 1; }
  test -s "$v2/public/index.html" ||
    { echo "$v2 has no nonempty public/index.html" >&2; exit 1; }
  umask 077
  netrc="$(mktemp)"
  next="${current}.rollback-next"
  lock=/srv/posvoji/.deploy-lock
  lock_owner=layout-v2-rollback-drill
  lock_owned=false
  restore_needed=false
  drill_passed=false
  atomic_link() {
    target="$1"
    ln -sfnT -- "$target" "$next" &&
      chown -h posvoji:caddy "$next" &&
      mv -Tf -- "$next" "$current"
  }
  check_home() {
    label="$1"
    for path in / /viri; do
      code="$(curl --disable -sS -o /dev/null -w '%{http_code}' \
        --noproxy '*' --connect-timeout 5 --max-time 15 \
        --netrc-file "$netrc" --resolve posvoji.si:443:127.0.0.1 \
        "https://posvoji.si$path")"
      test "$code" = 200 ||
        { echo "$label $path answered $code, expected 200" >&2; return 1; }
    done
  }
  cleanup() {
    status=$?
    trap - EXIT
    trap '' HUP INT PIPE TERM
    set +e
    cleanup_failed=false
    lock_release_safe=false
    if [ "$restore_needed" = true ]; then
      found="$(readlink "$current" 2>/dev/null || true)"
      case "$found" in
        "$v1"|"$v2")
          if atomic_link "$v2" &&
            test "$(readlink -f "$current")" = "$v2"; then
            echo "restored after early exit: current -> $v2"
          else
            echo "CRITICAL: could not restore current -> $v2" >&2
            cleanup_failed=true
          fi
          ;;
        *)
          echo "CRITICAL: refusing to overwrite current; it changed to $found" >&2
          cleanup_failed=true
          ;;
      esac
    fi
    if ! rm -f "$next"; then
      echo "could not remove temporary link: $next" >&2
      cleanup_failed=true
    fi
    if [ "$lock_owned" = true ] &&
      test -L "$current" &&
      test "$(readlink -f "$current")" = "$v2" &&
      test -d "$current/public" &&
      test ! -L "$current/public" &&
      test -s "$current/public/index.html" &&
      check_home "emergency-restored v2 release"; then
      lock_release_safe=true
    elif [ "$lock_owned" = true ]; then
      echo "CRITICAL: retaining $lock; current is not the saved healthy v2 target" >&2
      cleanup_failed=true
    fi
    if ! rm -f "$netrc"; then
      echo "could not remove credentials file: $netrc" >&2
      cleanup_failed=true
    fi
    if [ "$lock_owned" = true ] && [ "$lock_release_safe" = true ]; then
      found_owner="$(cat "$lock/owner" 2>/dev/null || true)"
      if { [ -z "$found_owner" ] || [ "$found_owner" = "$lock_owner" ]; } &&
        rm -f "$lock/owner" && rmdir "$lock"; then
        echo "released deployment lock"
      else
        echo "CRITICAL: could not release $lock (owner: $found_owner)" >&2
        cleanup_failed=true
      fi
    elif [ "$lock_owned" = true ]; then
      echo "deployment lock retained for inspection"
    fi
    if [ "$cleanup_failed" = true ] && [ "$status" -eq 0 ]; then
      status=1
    fi
    if [ "$drill_passed" = true ] && [ "$status" -eq 0 ]; then
      echo "rollback drill: OK"
    fi
    exit "$status"
  }
  trap cleanup EXIT
  trap 'exit 129' HUP
  trap 'exit 130' INT
  trap 'exit 141' PIPE
  trap 'exit 143' TERM
  cat >"$netrc" <<'NETRC'
machine posvoji.si login BASIC_AUTH_USER password BASIC_AUTH_PASSWORD
NETRC
  if mkdir "$lock"; then
    lock_owned=true
    printf '%s\n' "$lock_owner" >"$lock/owner" || exit 1
  else
    owner="$(cat "$lock/owner" 2>/dev/null || echo unknown)"
    echo "deployment lock is already held by $owner" >&2
    exit 1
  fi
  test -f /srv/posvoji/.layout-v2 ||
    { echo "layout v2 marker disappeared before the lock was acquired" >&2; exit 1; }
  test -L "$v1/public" ||
    { echo "$v1/public changed before the lock was acquired" >&2; exit 1; }
  test "$(readlink "$v1/public")" = . ||
    { echo "$v1/public is no longer the migration self-symlink" >&2; exit 1; }
  test -s "$v1/public/index.html" ||
    { echo "$v1 has no nonempty index.html under the lock" >&2; exit 1; }
  locked_v2="$(readlink -f "$current")"
  test "$locked_v2" = "$v2" ||
    { echo "current changed before the lock was acquired" >&2; exit 1; }
  case "$locked_v2" in
    "$releases"/*) ;;
    *) echo "current points outside $releases: $locked_v2" >&2; exit 1 ;;
  esac
  test -d "$locked_v2/public" && test ! -L "$locked_v2/public" ||
    { echo "current is not a layout v2 release under the lock" >&2; exit 1; }
  test -s "$locked_v2/public/index.html" ||
    { echo "$locked_v2 has no nonempty public/index.html under the lock" >&2; exit 1; }
  check_home "current v2 release"
  echo "current: $v2"
  restore_needed=true
  atomic_link "$v1" || { echo "could not flip current to $v1" >&2; exit 1; }
  test "$(readlink "$current")" = "$v1" ||
    { echo "current does not point at $v1" >&2; exit 1; }
  test -s "$current/public/index.html"
  check_home "v1 release"
  echo "the v1 release serves through current/public"
  atomic_link "$v2" || { echo "restore attempt failed" >&2; exit 1; }
  test "$(readlink -f "$current")" = "$v2" ||
    { echo "current did not return to $v2" >&2; exit 1; }
  test -d "$current/public" && test ! -L "$current/public" ||
    { echo "restored public/ is not a real directory" >&2; exit 1; }
  test -s "$current/public/index.html" ||
    { echo "restored index.html is missing or empty" >&2; exit 1; }
  check_home "restored v2 release"
  restore_needed=false
  drill_passed=true
)
```

`PICK-A-V1-RELEASE` is a placeholder. The initial checks reject an obviously
wrong selection without touching `current`. After acquiring the deployment
lock, the block repeats the marker, v1 link/index and v2 target/shape/index
checks and proves that `current` still resolves to the saved target. Those
locked checks close the gap in which a deploy could otherwise prune or replace
a target between inspection and the first flip. It also authenticates against
the current v2 site before that flip, so a placeholder or mistyped credential
cannot trigger a needless production change.

The drill acquires the same host-wide `.deploy-lock` as `deploy.sh`, so a
manual deploy cannot interleave with either flip. If the lock already exists,
the block prints its owner and stops before changing `current`; investigate a
stale lock rather than deleting one that may belong to a live deploy.

The ordinary path restores v2 explicitly and verifies its symlink target,
directory shape, index and authenticated 200. The EXIT handler prints
`rollback drill: OK` only after credential cleanup and lock release also
succeed. It is an emergency fallback for an assertion failure,
disconnect or signal after the first flip. Signal handlers exit with their
conventional status and let EXIT run cleanup once; cleanup ignores further
signals, retries the restore, verifies it, and removes the temporary link and
credentials independently. It releases the deployment lock only after proving
that `current` is the saved v2 target with a real `public/` and nonempty index.
If another actor changed `current` or restoration stays uncertain, cleanup
refuses to overwrite it, reports a critical failure and retains the lock.

Both directions use the same sibling-link plus `mv -Tf` replacement as
`deploy.sh`: the final same-filesystem rename is atomic. No shell trap can
recover from `SIGKILL`, a host loss or a failed disk operation, so the guarantee
is deliberately narrower: covered failures attempt restoration and make a
failed restore loud and non-zero; the final structural and authenticated checks
are the proof that restoration actually landed.

Re-enable the scheduled task only after the structural checks, the
authenticated checks and the drill have all passed:

```powershell
Enable-ScheduledTask -TaskName PosvojiCrawlDeploy -TaskPath \Posvoji\
```

### One committed ingest generation

A release is packaged only when `generation.json` validates the exact bytes of
all six receipt-bound JSON inputs (the five deployment inputs plus the image
cache used by partial derivation) and all media the public snapshot references.
The export writes those files one after another and the receipt last. A stopped
run therefore leaves a missing receipt or a digest mismatch even when every
individual file parses and all filenames still exist. `verify-media.mjs`
refuses the snapshot before host mutation; `scripts/publication.cjs` also
requires `animals.json`, `animals.crawled.json` and `overrides.json` to share
one `generatedAt`, and carries the validated generation id into the layout-v2
release receipt.

The ingest enforces the same invariant at the other end
(`apps/ingest/src/crawled-snapshot.ts`): a run that finds `animals.json` and
`animals.crawled.json` from different runs aborts without reading either. The
recovery in both places is a fresh export, and with the portal integration on
that means one full clean `pnpm dataset:export --refresh-all` over every
provider, which is the only run that may re-derive the crawled snapshot.

## Deleting withdrawn media

The sync the script runs is a `tar` stream into a per-run staging directory.
Its file list is derived from `animals.json`, `share-cards.json` and
`shelter-logos.json`, not by enumerating the local cache. That distinction is a
policy boundary: even if an ingest cleanup warned and left an old file on disk,
deployment neither uploads it nor retains it as desired. Once the whole stream
arrives, each nonempty regular file is renamed over its live counterpart
atomically; this adds and overwrites but never removes. Before the first rename,
the script rejects mountpoints at or below the staging and live roots and
compares the staging device with every unique live destination directory. That
proves GNU `mv` cannot fall back to a cross-device copy. A connection loss can
leave old and new complete files mixed, but never a partially written live
file, and the retained deployment lock makes that state an operator-visible
failure. `rsync -a --delete` would be the natural way to mirror the intended
snapshot, but Git Bash on Windows carries no `rsync` binary, so the script
cannot rely on it.

Instead it does the same job as a list diff. Once the complete staging tree is
on the host, the host writes its sorted relative paths before moving those
files live. It then sorts its live `find` listing and runs `comm -13` to get
paths that exist live but were absent from that exact staged tree. Both lists
sort with `LC_ALL=C`. The remote-only list is consumed one exact path per
iteration and every removal is checked before success is reported. Nothing in
the desired staged list is ever touched. The live inventory deliberately
includes zero-byte regular files: receipt verification rejects one when it is
referenced by the new snapshot, while an unreferenced zero-byte file needs to
reach this diff so it can be deleted as an orphan instead of blocking every
future scheduled deploy.

This matters for the right-to-exit clause in [DATA-POLICY.md](DATA-POLICY.md):
a photo a shelter takes down, or a shelter that opts out entirely, has to stop
being served, not just stop being linked from the dataset. Without a
manifest-derived allowlist and delete step, a stale local cache file could keep
serving from production indefinitely after it disappeared from the published
snapshot.

The delete step is guarded twice. No diff starts until the tar stream has
completed, all staged entries are directories or nonempty regular files, and the
desired list has been generated from that tree on the host; there is no second
list stream that can arrive short. Behind that sits a backstop on the size of
the deletion itself, a share of what the host holds, which refuses and prints
the first candidates instead of acting. The constants are in the script and
carry their reasoning there. `--dry-run` computes nothing on the host and only
prints the intent.

## Serving media from the shared root

With media outside the release tree, the release artifact should exclude
`public/media/` entirely, and the web server serves `/media/` from the shared
root directly rather than from whatever release is current. That is cleaner
for a static export than symlinking each release's `public/media/` back to the
shared directory, because it needs no per-release setup step at all.

The examples below are for layout v2. Keep the v1 root at
`/srv/posvoji/current` until migration step 2, and never create the layout
marker while either server still uses that root: a v2 release places
`private/` there beside `public/`.

### nginx (layout v2)

```nginx
location /media/ {
    alias /srv/posvoji/media/;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header X-Content-Type-Options "nosniff" always;

    location /media/animals/ {
        add_header Referrer-Policy "strict-origin-when-cross-origin" always;
        add_header X-Content-Type-Options "nosniff" always;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }

    location /media/shelter-logos/ {
        add_header Referrer-Policy "strict-origin-when-cross-origin" always;
        add_header X-Content-Type-Options "nosniff" always;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }

    location /media/share/ {
        add_header Referrer-Policy "strict-origin-when-cross-origin" always;
        add_header X-Content-Type-Options "nosniff" always;
        add_header Cache-Control "public, max-age=3600";
    }
}

location / {
    root /srv/posvoji/current/public;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header X-Content-Type-Options "nosniff" always;

    try_files $uri.html $uri $uri/ =404;
}
```

`alias` (not `root`) is what makes `location /media/` map to
`/srv/posvoji/media/` instead of `/srv/posvoji/media/media/`. nginx stops
inheriting parent `add_header` values as soon as a child defines one, so every
media child repeats the two security headers. `Cache-Control` deliberately has
no `always`: successful responses, redirects and 304s get the cache policy,
while an authentication or missing-file error does not become immutable.

### Caddy (layout v2)

```caddy
posvoji.si {
    handle_path /media/* {
        root * /srv/posvoji/media
        file_server

        @cachedMedia path /animals/* /shelter-logos/*
        header @cachedMedia Cache-Control "public, max-age=31536000, immutable" {
            match status 2xx 304
        }

        @shareCards path /share/*
        header @shareCards Cache-Control "public, max-age=3600" {
            match status 2xx 304
        }
    }

    root * /srv/posvoji/current/public
    try_files {path}.html {path} {path}/index.html
    file_server

    header {
        Referrer-Policy "strict-origin-when-cross-origin"
        X-Content-Type-Options "nosniff"
    }
}
```

`handle_path` strips the `/media` prefix before matching inside the block,
which is why the `@cachedMedia` and `@shareCards` paths above do not start with
`/media/`. The response matchers keep cache headers off 4xx and 5xx responses,
while the security-header block remains unconditional. The `.html` candidate
must precede the literal path: Next exports both `en/resources.html` and an
`en/resources/` RSC directory, and selecting the directory first breaks the
clean `/en/resources` URL.

## Build order

`pnpm --filter web build` reads `data/dist/animals.json` and serves whatever
is already sitting in `apps/web/public/media/`. It does not fetch or generate
either one. A production build has to run, in order:

1. `pnpm dataset:export` (a full crawl and cache pass), or `pnpm images:derive`
   when only image derivatives need backfilling after a schema-only change, or
   a receipt-named derivative is missing, and nothing needs re-crawling.
2. `pnpm --filter web build`.

Skipping step 1 does not fail the build. It can produce a site from missing or
stale generated state: absent animal photos, shelter logos or link-preview
cards are valid handled states, while old files still look structurally valid.
Nothing in `pnpm typecheck`, `pnpm test` or `pnpm validate:policies` proves
freshness, because none of them regenerates `public/media/` or `data/dist/`.
That incomplete or stale build must never be the one that lands in production.

`scripts/deploy.sh` refuses to start when any receipt-bound JSON input or
`data/dist/generation.json` is missing, when the media root is missing, or when
`pnpm media:verify` finds a referenced file absent, empty, replaced or different
from the receipt's digest. A snapshot that references no media is valid. Its
checkout-local artifact lock prevents ingest from changing those inputs while
a separately verified immutable snapshot is made. Build and upload read that
snapshot, so they no longer need to hold the checkout lock. Those are
consistency checks, not a freshness oracle. The script does not run step 1 for
you: a crawl is a decision, not a deploy step.

## Verify before flipping the symlink

```bash
pnpm media:verify   # against apps/web/public/media in this checkout
```

`scripts/verify-media.mjs` validates `data/dist/generation.json` against the
six receipt-bound JSON files and every referenced media file's SHA-256 digest, then derives
the exact media paths the site can request. Each must also be a nonempty regular
file under the media root argument (`apps/web/public/media` by default); a
same-named directory, symlink or empty file cannot impersonate media. Missing
or unreadable referenced media are aggregated so one run prints every gap.
Missing, malformed, extra or stale receipt entries fail closed. The empty media
map is valid when the snapshot references no media. The verifier has no package
dependencies; the host still needs Node 22+.

`node scripts/verify-media.mjs --list` performs the same validation but prints
only the sorted referenced paths. `deploy.sh` captures that output from the
immutable local snapshot and passes it to `tar -T`; this is the exact
publication allowlist used to build the host staging tree.

`scripts/deploy.sh` invokes it three times against two media roots. Local
preflight fails fast before a long build; the immutable-worktree `--list` run
produces the exact tar allowlist from the same committed verifier code the
release builds. The deploy stage then ships both helpers and all seven required
`data/dist` files to a throwaway host directory and validates
`/srv/posvoji/media` after media sync and orphan cleanup but before the release
flip. The directory is root-owned mode 700 and its extracted files are protected
by a 077 umask plus `--no-same-permissions`, because the set includes the private
crawled dataset and overrides audit trail. That host run catches a short or
wrong upload on the disk visitors use.
A release directory does not contain these verifier inputs, so
`pnpm media:verify` is not a valid command there. To repeat the host check by
hand, stage `scripts/verify-media.mjs`, `scripts/media-references.mjs`,
`scripts/generation-receipt.mjs`, and the six receipt-bound JSON files plus
`generation.json` in the same temporary tree, then run the verifier against
`/srv/posvoji/media`.

A missing `.avif` renders a **blank hero**, not the WebP beside it. `<picture>`
commits to a `<source>` by its MIME type before it requests anything, so once
the browser has taken the AVIF there is no fallback left to take: the animal
page and the dialog draw an empty box where the photo should be.

A missing ladder rung is the same thing quietly. The browser picks the
candidate the `sizes` string points it at, gets a 404, and draws nothing. Which
rung it picks depends on the viewport and the device pixel ratio, so the gap
can be invisible on the machine that deployed it and total on a phone.

A missing cached copy or thumbnail is the ordinary broken image, which is at
least visible, but it is the same root cause and costs nothing to check at the
same time.

None of the three shows up in a build, a log or the test suite, because
`public/media/` is written by ingest, is gitignored, and in production lives
outside the release tree entirely. This is the last point anything can catch
them.
