# Deploy headers

`apps/web` is a static export (`next export`). Next.js only applies the
`headers()` config from `next.config.ts` when it is serving requests itself,
which a static export never does. Any headers this site needs have to come
from whatever serves the exported files, not from Next.js.

At minimum, set these two on every response:

- `Referrer-Policy: strict-origin-when-cross-origin`
- `X-Content-Type-Options: nosniff`

## nginx

Add this to the site's server block, at the location that serves the
exported files:

```nginx
location / {
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header X-Content-Type-Options "nosniff" always;

    try_files $uri $uri.html $uri/ =404;
}
```

The `always` flag makes nginx send the header on error responses too, not
just 2xx ones.

## Caddy

```caddy
example.com {
    root * /var/www/posvoji
    file_server

    header {
        Referrer-Policy "strict-origin-when-cross-origin"
        X-Content-Type-Options "nosniff"
    }
}
```

## Media cache headers

See [DEPLOY-MEDIA.md](DEPLOY-MEDIA.md) for where these files live in
production, how they get there, and the build-order requirement that keeps a
release from shipping without them.

`apps/ingest` writes three kinds of file under `apps/web/public/media/`, and
each needs a different `Cache-Control`. The naming scheme is what tells you
which is which; getting this wrong either serves stale files forever or
throws away caching that is safe to keep.

### `/media/animals/*`

Filenames are the sha256 of the processed bytes, sliced to 16 hex characters,
plus `.webp` or `.thumb.webp` (see `apps/ingest/src/cache-images.ts`,
`processImage` and `thumbFileFor`). A replaced photo gets a new name; the old
name never points at a different picture. That makes the file permanently
cacheable:

```
Cache-Control: public, max-age=31536000, immutable
```

One case does rewrite an existing name: a `DERIVATIVE_VERSION` bump re-cuts
the thumb, rungs and hero avif from the master, and derivative names come
from the master's hash rather than their own bytes. The picture is the same
and only the encoding changed, so a cache that keeps serving the previous
bytes for the rest of the year is showing the right image either way. The
master itself is never re-encoded in place, so this never affects `.webp`
files named for their own contents.

### `/media/shelter-logos/*`

Same scheme: filenames are the sha256 of the processed logo bytes
(`apps/ingest/src/cache-logos.ts`, `processLogo`). A redesigned logo gets a
new name, so this is content-hashed too and gets the same header:

```
Cache-Control: public, max-age=31536000, immutable
```

### `/media/share/*`

Filenames here are the animal id, not a content hash (`shareCardFile` in
`apps/ingest/src/share-cards.ts` writes `<id>.jpg` or `<id>.<locale>.jpg`).
The same name can point at different bytes over time: an animal's status,
name or photo can change and the card is redrawn under the same filename.
`immutable` or a long `max-age` would leave link-preview crawlers (Facebook,
Slack, Twitter) showing a stale card indefinitely, since most of them cache
the image themselves for as long as the header allows. Use a short one
instead:

```
Cache-Control: public, max-age=3600
```

An hour is enough to avoid re-rendering the same card for every crawler hit on
a shared link, short enough that an outcome or photo change catches up
quickly.

### nginx

```nginx
location /media/animals/ {
    add_header Cache-Control "public, max-age=31536000, immutable" always;
}

location /media/shelter-logos/ {
    add_header Cache-Control "public, max-age=31536000, immutable" always;
}

location /media/share/ {
    add_header Cache-Control "public, max-age=3600" always;
}
```

Put these above the general `location /` block; nginx matches the most
specific prefix, so order between these three does not matter.

### Caddy

```caddy
example.com {
    root * /var/www/posvoji
    file_server

    header {
        Referrer-Policy "strict-origin-when-cross-origin"
        X-Content-Type-Options "nosniff"
    }

    @cachedMedia path /media/animals/* /media/shelter-logos/*
    header @cachedMedia Cache-Control "public, max-age=31536000, immutable"

    @shareCards path /media/share/*
    header @shareCards Cache-Control "public, max-age=3600"
}
```
