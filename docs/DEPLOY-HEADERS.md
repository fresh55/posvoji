# Deploy headers

`apps/web` uses `next build` with `output: "export"`. Next.js only applies the
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

    try_files $uri.html $uri $uri/ =404;
}
```

The `always` flag makes nginx send the header on error responses too, not
just 2xx ones.

If the same nginx instance proxies `api.posvoji.si` to the portal on loopback,
pass the client chain by setting `X-Forwarded-For` to
`$proxy_add_x_forwarded_for`. The portal trusts that single same-host hop for
login-link rate limiting. Set `PORTAL_TRUSTED_PROXY_COUNT` to the exact number
of controlled rightmost hops when the proxy is not on loopback or the request
passes through more than one proxy.

## Caddy

This is a header-only excerpt, not the complete production media configuration:

```caddy
posvoji.si {
    root * /srv/posvoji/current/public
    try_files {path}.html {path} {path}/index.html
    file_server

    header {
        Referrer-Policy "strict-origin-when-cross-origin"
        X-Content-Type-Options "nosniff"
    }
}
```

Use the complete shared-media example below in production; media is excluded
from releases and lives under `/srv/posvoji/media`.

Caddy's `reverse_proxy` sets `X-Forwarded-For` for the upstream. The portal
automatically trusts one Caddy hop when it connects on loopback; otherwise set
`PORTAL_TRUSTED_PROXY_COUNT` to the exact number of controlled rightmost hops.

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

Filenames here are stable id-derived names, not content hashes. `shareCardFile`
in `apps/ingest/src/share-cards.ts` writes a sanitized bounded stem plus a
16-hex digest of the full id, optionally followed by a locale. The same name
can point at different bytes over time: an animal's status, name or photo can
change and the card is redrawn under the same filename.
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
```

Put this above the general `location /` block. `alias` maps `/media/` to the
shared production tree, and nginx matches the most specific nested prefix.
Each child repeats the security headers because defining any `add_header` stops
normal inheritance from the parent. Keeping `always` only on security headers
prevents a 401 or 404 from being cached as immutable for a year.

### Caddy

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

`handle_path` removes the `/media` prefix before matching inside the block. The
response matchers apply cache policy only to successful/304 responses, so a
transient authentication or missing-file error cannot acquire a long-lived
public cache header. The `.html` candidate comes before the literal path because
Next also exports a same-named directory of RSC payloads; choosing that directory
first breaks clean URLs such as `/en/resources`.
