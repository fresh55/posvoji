# Deploy: the media lifecycle

`apps/web/public/media/` is not repository content. It is written by
`apps/ingest` and is gitignored, along with `data/dist/`. A release-symlink
deploy has to account for that separately from the build itself: the files
have to exist before the build runs, and in production they should not travel
inside the release artifact at all.

## What writes the media directories

| Directory | Written by | Naming | Size (current dataset) |
|---|---|---|---|
| `public/media/animals/` | `pnpm dataset:export`, `pnpm images:derive` | content hash | ~232 MB |
| `public/media/shelter-logos/` | `pnpm dataset:export`, `pnpm logos:fetch` | content hash | ~70 KB |
| `public/media/share/` | `pnpm dataset:export` only | animal id | ~39 MB |

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

**`share/`** (`apps/ingest/src/share-cards.ts`). Filenames here are the
animal id, not a hash: `<id>.jpg` for a photo card, `<id>.sl.jpg` and
`<id>.en.jpg` for the two typographic-card locales. The same filename points
at different bytes over time, because an animal's name, status or photo can
change and the card is redrawn under the same name. Cards are only drawn by
`dataset:export`, since drawing one needs a cached photo from `animals/` to
composite.

Each directory's cache-control needs follow directly from this: hash-named
files are safe to cache forever, id-named ones are not. See
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

## Deploying

```bash
bash scripts/deploy.sh --dry-run   # everything local, prints the remote commands
bash scripts/deploy.sh             # the real thing
```

`scripts/deploy.sh` is the deploy path. It does the whole sequence below in
order, and the order is the point: the media has to be on the host before any
release that references it is live. Everything it needs is in the script, so
nothing here has to be run by hand.

`--dry-run` runs the preflight, the full build and the artifact packing, then
prints every remote command it would run instead of running it. It opens no
connection to the host. Use it to see what a deploy would ship before shipping
it.

### What the script does

**Preflight.** Aborts on a dirty working tree (`--allow-dirty` overrides, with
a warning: the build happens at HEAD either way, so uncommitted work is not
what goes out). Aborts if `data/dist/animals.json` or
`apps/web/public/media/animals` is missing or empty, which is the photo-less
build described under Build order below. Then runs `pnpm media:verify` and
aborts if anything the dataset references is not on disk.

**Build.** Adds a detached `git worktree` at HEAD in a temp directory, copies
`data/dist` into it and links `apps/web/public/media` in (a junction on
Windows, a symlink elsewhere, a copy if neither works), then runs
`pnpm install --frozen-lockfile` and `pnpm --filter web build` there. Building
in a worktree rather than in place is what makes the artifact correspond to a
commit instead of to whatever is currently in the editor. The worktree is
removed on every exit path, failures included.

**Artifact.** A gzipped tar of `apps/web/out`, excluding `./media` and any
`*.br`/`*.gz`. The media exclude is the whole point of the shared directory:
the export copies `public/media` into `out/`, and that copy must not travel
inside a release. The `.br`/`.gz` exclude is a guard only. `next build` emits
no precompressed siblings, so the ones in an older hand-made release came from
that deploy, not from the build, and the Caddyfile has no `precompressed`
directive to read them with anyway.

**Deploy**, in this order:

1. Media sync into `/srv/posvoji/media`, then `chown`/`chmod` and a file count
   printed as a sanity line.
2. Orphan cleanup: delete media on the host that the local dataset no longer
   references. See "Deleting withdrawn media" below.
3. `scripts/verify-media.mjs` shipped to a throwaway directory on the host and
   run there against `/srv/posvoji/media`, aborting before the flip on a
   nonzero exit. See "Verify before flipping the symlink" below.
4. The layout gate: the host is asked for `/srv/posvoji/.layout-v2`. See
   "Release layout" below.
5. A new `/srv/posvoji/releases/<sha12>-<UTC stamp>/`, the artifact unpacked
   into it, same ownership and modes. Under layout v2 the artifact goes to
   `public/` and the two datasets plus `publication.json` go to `private/`.
6. A health check of the new directory while nothing points at it yet:
   `index.html` exists and is nonempty, and so does one hashed asset taken
   from the artifact listing. Under layout v2 the three private files are
   checked too, and so is the absence of `private/` inside `public/`.
7. `ln -sfn` onto `/srv/posvoji/current`. One operation, so no request sees a
   missing `current/`.
8. `curl -skI --resolve posvoji.si:443:127.0.0.1` from the host, expecting 200
   or 401, printed.
9. Prune to the newest three releases, sorted by mtime and skipping whatever
   `current` resolves to, so a rollback cannot delete the release it points
   at. A release directory is pruned whole, `private/` included.

Everything under `/srv/posvoji` ends up owned `posvoji:caddy`, directories
`750`, files `640`.

## Production layout: media outside the release

A release-symlink deploy makes a fresh directory per release and flips a
symlink (`/srv/posvoji/current`) to point at it once the build succeeds.
Shipping 271 MB of media inside that per-release directory means copying it on
every deploy for files that mostly have not changed.

Keep media in one shared directory on the host, outside every release:

```
/srv/posvoji/
  media/                 <- shared, never inside a release
    animals/
    shelter-logos/
    share/
  releases/
    a1b2c3d4e5f6-20260827T100000Z/
      <the static export, no media/ under public/>
    f6e5d4c3b2a1-20260828T093000Z/
  current -> releases/f6e5d4c3b2a1-20260828T093000Z
```

The release name is the commit sha and the UTC time of the deploy, so a
directory on the host says which commit it is without looking anything up.

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
    publication.json        releaseId, datasetGeneratedAt, overridesEnabled,
                            and portalGeneratedAt when the portal was on
```

`publication.json` is written by `scripts/publication.cjs`, which `deploy.sh`
runs before it uploads anything, rather than by the ingest: the release id only
exists at deploy time. With the portal off, `portalGeneratedAt` is left out
rather than filled with the run's own clock. That script is also where the
generation check lives, below.

The gate is the marker file `/srv/posvoji/.layout-v2`. `deploy.sh` reads it
over SSH on every deploy and needs no flag. This is not ceremony: the scheduled
crawl runs `deploy.sh` unattended every 12 hours from a clone it hard-resets to
`origin/main`, so whichever half of the migration lands first has to be
survivable. Layout v2 under the old docroot 404s the whole site; private files
under the old docroot are downloadable. With the marker absent the script ships
today's layout, withholds the private artifacts entirely, and prints the
migration steps below.

### Moving the host onto layout v2

Three steps, in this order. The site answers normally between every pair of
them and each step is reversible on its own.

Pause the scheduled crawl first and resume it after step 3
([CRAWL-SCHEDULING.md](CRAWL-SCHEDULING.md) asks for that before any hand
change to production anyway). A deploy that lands between steps 1 and 3 ships
today's layout, and that release has no `public/` of its own: step 1 links the
releases that exist when it runs, and nothing links the ones made after it.
Step 2's first check is what catches it, and re-running step 1's block fixes
it.

**1. Give every existing release a self-symlink.** On the host:

```bash
(
  set -e
  for r in /srv/posvoji/releases/*/; do
    if [ -e "${r}public" ] && [ ! -L "${r}public" ]; then
      echo "abort: ${r}public is a real directory" >&2
      exit 1
    fi
  done
  for r in /srv/posvoji/releases/*/; do
    ln -sfn . "${r}public"
    chown -h posvoji:caddy "${r}public"
  done
)
```

The first pass checks every release before the second links anything. A real
`public/` directory is a layout v2 release that is already there, and it must
not be linked over; the run stops with nothing changed. The subshell keeps the
abort out of your login shell.

Each v1 release is now serveable at both `<release>` and `<release>/public`,
because the link resolves back to the release root and Caddy's `file_server`
follows symlinks. Nothing points at the new path yet, so no request changes.
The block is idempotent, and undoing it is deleting the links.

**2. Move Caddy's docroot to `/srv/posvoji/current/public`, validate the config,
then reload.** The release `current` points at is still the one being served,
now through its own self-symlink. Before the reload, on the host:

```bash
test -s /srv/posvoji/current/public/index.html
caddy validate --config /etc/caddy/Caddyfile
```

The config path differs per install; `/etc/caddy/Caddyfile` is the common
default. Reload only after validate passes. The first check says the path
resolves, which is also what confirms `file_server` follows the link rather
than refusing it, and it is what catches a release shipped after step 1.
After the reload:

```bash
test -s /srv/posvoji/current/public/index.html
curl -skI --resolve posvoji.si:443:127.0.0.1 https://posvoji.si/
```

The curl says the site answers through the new docroot. Undo by putting the old
docroot back and reloading.

**3. `touch /srv/posvoji/.layout-v2`.** From here every deploy ships a real
`public/` with a `private/` beside it. The prune retires the self-linked
releases as they age out, and a rollback onto one of them keeps serving,
because of step 1. A release carrying the self-symlink prunes like any other:
`readlink -f` on the release directory is the directory itself, and `rm -rf`
unlinks a symlink it meets rather than following it.

The order is what avoids an outage. Creating the marker first ships layout v2
into a docroot that has no `public/`, and moving the docroot first points it
at a path no existing release has: either one 404s the whole site until the
other half lands. Step 1 makes the new path valid for the releases that
already exist, which is what lets the two halves be done separately.

`deploy.sh`'s own pre-flip check asserts that the release it just built has a
real `public/` directory rather than a symlink, so a self-linked v1 release
can never be mistaken for a v2 one. It only ever inspects the release of the
run it is in, so the self-links from step 1 are never in its way.

### One export run, three files

A layout v2 release is packaged only when `animals.json`,
`animals.crawled.json` and `overrides.json` all carry the same run's
`generatedAt`. The export writes them one after another, so a run that stopped
partway leaves a set that disagrees, and the disagreement is the only thing
that says so: each file is valid on its own. `scripts/publication.cjs` refuses
to write the receipt for such a set, before the release is uploaded, and the
deploy stops.

The ingest enforces the same invariant at the other end
(`apps/ingest/src/crawled-snapshot.ts`): a run that finds `animals.json` and
`animals.crawled.json` from different runs aborts without reading either. The
recovery in both places is a fresh export, and with the portal integration on
that means one full clean `pnpm dataset:export --refresh-all` over every
provider, which is the only run that may re-derive the crawled snapshot.

## Deleting withdrawn media

The sync the script runs is a `tar` stream, which adds and overwrites but
never removes. `rsync -a --delete` would be the natural way to mirror the
sweep `cacheImages`, `cacheLogos` and `writeShareCards` already run locally,
where a file no longer referenced by the dataset is removed, but Git Bash on
Windows carries no `rsync` binary, so the script cannot rely on it.

Instead it does the same job as a list diff. The local, sorted list of every
relative path under `apps/web/public/media/` is piped to the host, which sorts
its own `find` listing the same way and runs `comm -13` between the two to get
the paths that exist on the host but not locally. Both sides sort with
`LC_ALL=C`; a locale mismatch between the two produces a bogus diff (this was
hit for real during development). The remote-only paths are deleted with a
null-safe `xargs`, and only ever the remote-only paths: nothing in the local
list is ever touched.

This matters for the right-to-exit clause in [DATA-POLICY.md](DATA-POLICY.md):
a photo a shelter takes down, or a shelter that opts out entirely, has to stop
being served, not just stop being linked from the dataset. Without a delete
step it would keep serving from production indefinitely after it disappeared
from the ingest machine.

The delete step is guarded twice. The count of the local file list is taken on
the ingest machine and checked on the host, and a list that arrives short of it
is refused before the diff runs: that is what stops a local `find` that died
partway from reading as "the dataset dropped every name it never sent". Behind
that sits a backstop on the size of the deletion itself, a share of what the
host holds, which refuses and prints the first of the candidate files instead
of acting. The constants are in the script and carry their reasoning there.
`--dry-run` computes nothing on either side and only prints the intent.

## Serving media from the shared root

With media outside the release tree, the release artifact should exclude
`public/media/` entirely, and the web server serves `/media/` from the shared
root directly rather than from whatever release is current. That is cleaner
for a static export than symlinking each release's `public/media/` back to the
shared directory, because it needs no per-release setup step at all.

### nginx

```nginx
location /media/ {
    alias /srv/posvoji/media/;

    location /media/animals/ {
        add_header Cache-Control "public, max-age=31536000, immutable" always;
    }

    location /media/shelter-logos/ {
        add_header Cache-Control "public, max-age=31536000, immutable" always;
    }

    location /media/share/ {
        add_header Cache-Control "public, max-age=3600" always;
    }
}

location / {
    root /srv/posvoji/current;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header X-Content-Type-Options "nosniff" always;

    try_files $uri $uri.html $uri/ =404;
}
```

`alias` (not `root`) is what makes `location /media/` map to
`/srv/posvoji/media/` instead of `/srv/posvoji/media/media/`. The nested
locations for cache-control are unchanged from DEPLOY-HEADERS.md; only the
root they resolve against has moved off the release path.

### Caddy

```caddy
example.com {
    handle_path /media/* {
        root * /srv/posvoji/media
        file_server

        @cachedMedia path /animals/* /shelter-logos/*
        header @cachedMedia Cache-Control "public, max-age=31536000, immutable"

        @shareCards path /share/*
        header @shareCards Cache-Control "public, max-age=3600"
    }

    root * /srv/posvoji/current
    file_server

    header {
        Referrer-Policy "strict-origin-when-cross-origin"
        X-Content-Type-Options "nosniff"
    }
}
```

`handle_path` strips the `/media` prefix before matching inside the block,
which is why the `@cachedMedia` and `@shareCards` paths above no longer start
with `/media/`, unlike the ones in DEPLOY-HEADERS.md that match against the
release root.

## Build order

`pnpm --filter web build` reads `data/dist/animals.json` and serves whatever
is already sitting in `apps/web/public/media/`. It does not fetch or generate
either one. A production build has to run, in order:

1. `pnpm dataset:export` (a full crawl and cache pass), or `pnpm images:derive`
   when only image derivatives need backfilling after a schema-only change and
   nothing needs re-crawling.
2. `pnpm --filter web build`.

Skipping step 1 does not fail the build. It produces a site with no animal
photos, no shelter logos and no link-preview cards: `shareCardUrl()` returns
`undefined` and `getShelterLogos()` returns `{}`, both of which are valid,
handled states the site falls back on quietly. Nothing in `pnpm typecheck`,
`pnpm test` or `pnpm validate:policies` catches this, because none of them
touch `public/media/` or `data/dist/`. A photo-less build only becomes visible
once the site is live and it must never be the one that lands in production.

`scripts/deploy.sh` refuses to start when `data/dist/animals.json` or
`apps/web/public/media/animals` is missing or empty, which is what that trap
looks like from the outside. It does not run step 1 for you: a crawl is a
decision, not a deploy step.

## Verify before flipping the symlink

```bash
pnpm media:verify                      # against apps/web/public/media
pnpm media:verify /srv/posvoji/media   # on the host, against the shared root
```

`scripts/verify-media.mjs` reads `data/dist/animals.json`, `share-cards.json`
and `shelter-logos.json`, derives every media path the site can request, and
checks each one exists under the media root given as its argument
(`apps/web/public/media` by default). It groups the referenced paths by their
subdirectory (`animals/`, `share/`, `shelter-logos/`), reads each of those
once with `readdirSync`, and checks membership against that listing rather
than calling `existsSync` per file, which is what makes ~9000 files cheap to
check. It exits nonzero and lists every file it could not find. Node builtins
only, so it runs on the deploy host with nothing installed.

`scripts/deploy.sh` runs it twice, against two different directories, and both
matter. The preflight run is against `apps/web/public/media`, the local
directory the build is about to read; it fails fast, before a long build,
but a gap here is nearly impossible since that is the same directory ingest
just wrote. The deploy stage ships the script plus the `data/dist/*.json`
manifests it reads to a throwaway directory on the host and runs it there
against `/srv/posvoji/media`, after the media sync and the orphan cleanup and
before the release symlink flips, aborting the deploy on a nonzero exit. That
second run is the one that can actually fail: it is checking the sync itself,
on the disk a visitor's request will actually be served from, which is the
exact gap the local run cannot see. The host-side run is still worth doing by
hand (`pnpm media:verify /srv/posvoji/media` over an ssh session) after a sync
that looked odd. Three failure modes make this worth a step of its own.

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
