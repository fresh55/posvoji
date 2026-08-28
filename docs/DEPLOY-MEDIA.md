# Deploy: the media lifecycle

`apps/web/public/media/` is not repository content. It is written by
`apps/ingest` and is gitignored, along with `data/dist/`. A release-symlink
deploy has to account for that separately from the build itself: the files
have to exist before the build runs, and in production they should not travel
inside the release artifact at all.

## What writes the media directories

| Directory | Written by | Naming | Size (current dataset) |
|---|---|---|---|
| `public/media/animals/` | `pnpm dataset:export`, `pnpm images:derive` | content hash | ~236 MB |
| `public/media/shelter-logos/` | `pnpm dataset:export`, `pnpm logos:fetch` | content hash | ~70 KB |
| `public/media/share/` | `pnpm dataset:export` only | animal id | ~39 MB |

**`animals/`** (`apps/ingest/src/cache-images.ts`). The cached copy of a
photo is named `<sha256-16>.webp`, and its derivatives sit beside it under the
same hash: `<hash>.thumb.webp`, `<hash>-<width>.webp` for each ladder rung
(320/480/640px, skipping any rung at or above the photo's own width), and
`<hash>.avif` for an animal's first (hero) image. A re-encode or a replaced
source photo gets a new hash, so nothing under this directory ever changes its
bytes under an existing name. `dataset:export` fetches, encodes and derives in
one pass; `images:derive` only backfills derivatives (thumb, rungs, blur
placeholder, hero avif) from photos already on disk, without any network
request, which is what a schema-only change needs.

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

## Production layout: media outside the release

A release-symlink deploy makes a fresh directory per release and flips a
symlink (for example `/srv/posvoji/current`) to point at it once the build
succeeds. Shipping 275 MB of media inside that per-release directory means
copying it on every deploy for files that mostly have not changed.

Keep media in one shared directory on the host, outside every release:

```
/srv/posvoji/
  media/                 <- shared, never inside a release
    animals/
    shelter-logos/
    share/
  releases/
    2026-08-27T10-00-00/
      <the static export, no media/ under public/>
    2026-08-28T09-30-00/
  current -> releases/2026-08-28T09-30-00
```

Sync `apps/web/public/media/` from the ingest machine into `/srv/posvoji/media/`
with `rsync --delete`:

```bash
rsync -a --delete apps/web/public/media/ deploy-host:/srv/posvoji/media/
```

`--delete` matters as much as the copy does: it mirrors the sweep `cacheImages`,
`cacheLogos` and `writeShareCards` already run locally, where a file no longer
referenced by the dataset is removed. Without `--delete`, a photo the shelter
took down, or a shelter that opted out entirely, would keep serving from
production indefinitely after it disappeared from the ingest machine. The
right-to-exit clause in [DATA-POLICY.md](DATA-POLICY.md) depends on this sync
actually removing files, not just adding them.

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

Run it after the media sync and before the release symlink moves. Three
failure modes make it worth a step of its own.

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
