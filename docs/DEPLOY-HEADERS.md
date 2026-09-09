# Deploy headers

`apps/web` uses `next build` with `output: "export"`. Next.js only applies the
`headers()` config from `next.config.ts` when it is serving requests itself,
which a static export never does. Any headers this site needs have to come
from whatever serves the exported files, not from Next.js.

At minimum, set these two on every response:

- `Referrer-Policy: strict-origin-when-cross-origin`
- `X-Content-Type-Options: nosniff`

Compression, a cache policy for `/_next/static` and the branded 404 have to
come from the same place, for the same reason.

## Compression

The exported site is text, and it is large. Measured on the September 2026
export: `out/index.html` is 1,475,957 bytes raw against 180,899 gzipped, and
the 22 chunks it loads are 1,373,577 raw against 431,461 gzipped. Without a
compression directive a first visit to the homepage pulls about 2.85 MB where
about 612 KB would do.

A browser always sends `Accept-Encoding`, so a server that has stopped
compressing looks exactly like one that has not: the page renders, nothing
errors, and only the transfer size differs. That is why the directive is
written down here, and why `scripts/monitor-production.sh` asserts
`Content-Encoding` on the homepage and on one `/_next/static` chunk on every
run.

`api.posvoji.si` already carries `encode zstd gzip`; see DEPLOY-PORTAL.md. The
public site needs the same directive. Caddy's `encode` skips content types that
are already compressed, so the media block is unaffected by it.

On nginx, list `image/svg+xml` explicitly: `app/icon.svg` is 11,478 bytes,
`components/logo.tsx` preloads it on every page, and no other entry in the list
covers it.

**Not verified against production.** `posvoji.si` answers `401` behind Caddy
`basic_auth`, the gate DEPLOY-PORTAL.md records, so
`curl -sI -H 'Accept-Encoding: gzip' https://posvoji.si/` cannot say what the
live server does with a real response. `scripts/deploy.sh` states in a comment
that the live Caddyfile "has no `precompressed` directive and encodes text on
the fly"; that Caddyfile lives on the host and is in no path of this
repository, so the claim could not be checked either. If the live config
already compresses, the directives below change nothing and this file finally
records what the server is doing. Run the curl once the gate comes off, before
assuming it either way.

## The branded 404

`next build` exports `out/404.html` from `app/global-not-found.tsx`, and
nothing serves it unless the server is told to. Caddy's `file_server` answers a
path with no candidate using its own plain-text page, and nginx's
`try_files ... =404` does the same. Both configurations below point the error
at the exported page and keep the original status, so a crawler still reads a
404.

Stale URLs are routine here, not exceptional. `app/sitemap.ts` publishes every
animal URL per locale, the animal routes are generated with
`dynamicParams = false`, and an adopted animal takes its URL with it on the
next build. `scripts/monitor-production.sh` requests a path that cannot exist
and asserts both halves, the status and the page's own text, so the server and
the export cannot drift apart again.

Unchecked against production for the same reason compression is: behind the
gate `curl -so /dev/null -w '%{http_code}' https://posvoji.si/ni-take-strani`
answers `401`, not `404`. The monitor settles it on its first run after the
gate comes off.

## nginx

Add this to the site's server block, around the location that serves the
exported files:

```nginx
gzip on;
gzip_vary on;
gzip_min_length 1024;
gzip_types text/css application/javascript application/json image/svg+xml application/xml;

location / {
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header X-Content-Type-Options "nosniff" always;

    error_page 404 /404.html;
    try_files $uri.html $uri $uri/ =404;
}

location = /404.html {
    internal;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header X-Content-Type-Options "nosniff" always;
}
```

The `always` flag makes nginx send the header on error responses too, not
just 2xx ones.

The `gzip` directives sit in the server block rather than inside `location /`,
because a `gzip_types` written in one location applies to that location alone
and the JavaScript chunks are served from `/_next/static/` below. `text/html`
is deliberately absent from the list: nginx compresses it whenever `gzip` is
on, and naming it again warns about a duplicate MIME type.

`error_page` sends a path with no file to the exported 404 page. The `internal`
location serves it and cannot be requested directly, and it repeats the two
security headers because a location that defines any `add_header` of its own
stops inheriting them.

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
    encode zstd gzip

    root * /srv/posvoji/current/public
    try_files {path}.html {path} {path}/index.html
    file_server

    handle_errors {
        rewrite * /404.html
        file_server
    }

    header {
        Referrer-Policy "strict-origin-when-cross-origin"
        X-Content-Type-Options "nosniff"
    }
}
```

`handle_errors` keeps the status Caddy produced, so this serves the branded
body with a real 404.

Use the complete shared-media example below in production; media is excluded
from releases and lives under `/srv/posvoji/media`.

Caddy's `reverse_proxy` sets `X-Forwarded-For` for the upstream. The portal
automatically trusts one Caddy hop when it connects on loopback; otherwise set
`PORTAL_TRUSTED_PROXY_COUNT` to the exact number of controlled rightmost hops.

## `/_next/static` cache headers

`next build` names every file under `/_next/static/` for a hash of its
contents, the way `apps/ingest` names a processed photo. A rebuilt chunk gets a
new name; the old name never points at different bytes. That makes it
permanently cacheable:

```
Cache-Control: public, max-age=31536000, immutable
```

With no policy at all the server falls back to `Last-Modified` and `ETag` and
the browser guesses a freshness lifetime from them, which on a release
deployed an hour ago is a few minutes. After that every chrome asset is
revalidated. The public site navigates with plain anchors rather than
`next/link`, so that revalidation is paid per click and not once per session,
and the 12h crawl keeps moving the timestamps the guess reads.

`.html` must keep revalidating. It is served by the `try_files` chain above,
and a long `max-age` there makes a deploy invisible.

What the live server sends today is unknown, again because of the gate:
`curl -sI https://posvoji.si/_next/static/chunks/<chunk>.js` answers `401`. If
the header is already set, these lines record it.

The three icons at the root are a separate case. Their names are fixed, so a
year is too long, but `/icon.svg` is requested under two URLs, bare by the
header logo's mask and with a hashed query string by Next's metadata, and its
bytes change only when the logo does. A day is long enough to be worth having
and short enough to correct.

### nginx

```nginx
location /_next/static/ {
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Cache-Control "public, max-age=31536000, immutable";
}

location ~ ^/(?:icon\.svg|favicon\.ico|apple-icon\.png)$ {
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Cache-Control "public, max-age=86400";
}
```

Put both above the general `location /` block, next to the media ones. Each
repeats the security headers for the same reason the media locations do. A
regex location wins over a prefix location wherever it matches, which is what
takes the three icons out of `location /` without naming each of them twice.

### Caddy

```caddy
@nextStatic path /_next/static/*
header @nextStatic Cache-Control "public, max-age=31536000, immutable" {
    match status 2xx 304
}

@siteIcons path /icon.svg /favicon.ico /apple-icon.png
header @siteIcons Cache-Control "public, max-age=86400" {
    match status 2xx 304
}
```

Both go inside the `posvoji.si` block, above the general `header` block, using
the same response matcher as the media rules so a missing file cannot acquire a
year-long public cache header. Caddy's path matcher ignores the query string,
so `@siteIcons` covers the bare `/icon.svg` the logo mask requests and the
hashed variant Next's metadata emits.

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
    encode zstd gzip

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

    @nextStatic path /_next/static/*
    header @nextStatic Cache-Control "public, max-age=31536000, immutable" {
        match status 2xx 304
    }

    @siteIcons path /icon.svg /favicon.ico /apple-icon.png
    header @siteIcons Cache-Control "public, max-age=86400" {
        match status 2xx 304
    }

    handle_errors {
        rewrite * /404.html
        file_server
    }

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

`encode` is a site-wide directive, and Caddy's directive order runs it ahead of
the handlers that produce a response wherever it is written in the block, so
one line covers the documents, the chunks and the media block. Its default
content-type match leaves the already-compressed images alone.
`handle_errors` catches a missing media file as well as a missing page, which
sends the HTML body to a request that wanted an image; the status is what a
crawler reads and the body is never seen. None of this changes what
`scripts/validate-caddy-layout.cjs` inspects: it follows roots and reachable
file servers through `routes`, and Caddy adapts `handle_errors` into a separate
error chain.
