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

`data/dist/*.json` sits next to these: `animals.json` is the dataset the site
reads, and `image-cache.json`, `shelter-logos.json`, `share-cards.json` are
the manifests that record what has already been fetched or drawn. The
manifests are what let a re-run skip work that is still valid; they are not
themselves served to visitors.

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
2. A new `/srv/posvoji/releases/<sha12>-<UTC stamp>/`, the artifact unpacked
   into it, same ownership and modes.
3. A health check of the new directory while nothing points at it yet:
   `index.html` exists and is nonempty, and so does one hashed asset taken
   from the artifact listing.
4. `ln -sfn` onto `/srv/posvoji/current`. One operation, so no request sees a
   missing `current/`.
5. `curl -skI --resolve posvoji.si:443:127.0.0.1` from the host, expecting 200
   or 401, printed.
6. Prune to the newest three releases, sorted by mtime and skipping whatever
   `current` resolves to, so a rollback cannot delete the release it points
   at.

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

The sync the script runs is a `tar` stream, which adds and overwrites but
never removes. `rsync -a --delete` is what this should become:

```bash
rsync -a --delete apps/web/public/media/ deploy-host:/srv/posvoji/media/
```

`--delete` matters as much as the copy does: it mirrors the sweep `cacheImages`,
`cacheLogos` and `writeShareCards` already run locally, where a file no longer
referenced by the dataset is removed. Without `--delete`, a photo the shelter
took down, or a shelter that opted out entirely, would keep serving from
production indefinitely after it disappeared from the ingest machine. The
right-to-exit clause in [DATA-POLICY.md](DATA-POLICY.md) depends on this sync
actually removing files, not just adding them. Until the script switches to
rsync, a file that leaves the ingest machine has to be removed from
`/srv/posvoji/media` by hand.

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
(`apps/web/public/media` by default). It exits nonzero and lists every file it
could not find. Node builtins only, so it runs on the deploy host with nothing
installed: copy the script and `data/dist/*.json` across and run it there, or
check the sync itself with `rsync -an --delete` and read what it still wants to
transfer.

`scripts/deploy.sh` runs the local one in its preflight, before it builds
anything: the host copy is written from the local one, so a gap there is a gap
everywhere. The host-side run is still worth doing by hand after a sync that
looked odd. Three failure modes make this worth a step of its own.

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
