# Deploy headers

`apps/web` uses `next build` with `output: "export"`. Next.js only applies the
`headers()` config from `next.config.ts` when it is serving requests itself,
which a static export never does. Any headers this site needs have to come
from whatever serves the exported files, not from Next.js.

At minimum, set these three on every response:

- `Referrer-Policy: strict-origin-when-cross-origin`
- `X-Content-Type-Options: nosniff`
- `Strict-Transport-Security: max-age=31536000; includeSubDomains`

Compression, a cache policy for `/_next/static` and the branded 404 have to
come from the same place, for the same reason.

## HSTS

Without `Strict-Transport-Security`, a navigation that starts from a typed
hostname, an old bookmark or a plain link goes to `http://posvoji.si` first and
waits for the `308`. That first request is unencrypted, and Chrome labels the
tab "Ni varno" until the redirect lands. The header makes the browser rewrite
the scheme itself, so the insecure request is never sent.

Measured 16 September 2026 against the live site, signed in past the gate: the
homepage returns `200` carrying `Referrer-Policy`, `X-Content-Type-Options`,
`X-Frame-Options` and `Permissions-Policy`, and no `Strict-Transport-Security`.

The header counts only on an HTTPS response. A browser ignores one received
over plain HTTP, so the redirect does not need it.

Raise `max-age` in stages, and confirm the site still serves between each step.
A browser that has cached the policy refuses plain HTTP for the whole duration
and offers no click-through past a certificate error:

1. `max-age=300`
2. `max-age=86400`
3. `max-age=31536000; includeSubDomains`

`includeSubDomains` reaches `mail.posvoji.si`, which is Neoserv's host rather
than ours. On 16 September 2026 it answered `200` over HTTPS with a valid
`*.posvoji.si` certificate, so the policy costs it nothing today. It also binds
every subdomain added later, including one stood up on HTTP for a few minutes.
IMAP and SMTP are unaffected; the policy is a browser rule.

Leave `preload` off. It submits the domain to a list compiled into browsers,
and removal takes months to reach users. It is worth doing once the site is
public and the year-long `max-age` has held; it is not worth doing during a
closed preview.

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
live server does with a real response. The live Caddyfile is assumed to encode
text on the fly and to carry no `precompressed` directive; it lives on the host
and is in no path of this repository, so that assumption could not be checked
either. If the live config
already compresses, the directives below change nothing and this file finally
records what the server is doing. Run the curl once the gate comes off, before
assuming it either way.

The whole check is one line:

```bash
curl -sI -H 'Accept-Encoding: gzip, zstd' https://posvoji.si/ | grep -i content-encoding
```

A line naming `gzip` or `zstd` is the answer. No line at all means the server
is sending the homepage uncompressed, and the fix is the `encode zstd gzip`
directive from the Caddy block below, added to the `posvoji.si` site block
followed by `sudo systemctl reload caddy`. Repeat the curl against one
`/_next/static/chunks/*.js` file from the current release: `encode` covers both
in one directive, and a chunk answering without the header means the directive
is not where it is assumed to be.

## The 3D model

`out/models/our-cat/cat.glb` is the one large asset on this site that no server
compresses on its own. Caddy's `encode` picks responses by `Content-Type`, and
its default match list is `text/*`, `font/*`, `image/svg+xml`, the two icon
types and a long set of `application/*` document and font types
([encode](https://caddyserver.com/docs/caddyfile/directives/encode)). No
`model/*` type is in it, so the model goes out raw.

The file is meshopt-encoded geometry, which is built to be entropy-coded
afterwards. Measured on the September 2026 export: 1,500,464 bytes raw,
624,978 gzipped, 550,478 brotli at quality 11. The gate page loads it on every
visit, `/o-nas` when a visitor scrolls to the stage and the homepage only when
one reaches for the corner, so a first visit to the gate wastes close to a
megabyte of it.

Quality 11 is too slow to run per request, so the build does it once.
`pnpm --filter web build` runs `apps/web/scripts/precompress-out.mjs` after
`next build`, which writes `cat.glb.br` and `cat.glb.gz` next to the model and
skips a sibling that is already newer than it. `scripts/deploy.sh` packs those
two into the release and fails a release that carries any other precompressed
sibling, since the host encodes text per request already.

**Sidecars are what this repository supports.** The on-the-fly alternative
below is written down for a host that cannot serve them, and it uses neither
file. Either way the host has to be configured, and until it is, the two files
are dead weight in the release: a sidecar nothing asks for is never read.

### Caddy

Give the `file_server` that serves the release the subdirective:

```caddy
root * /srv/posvoji/current/public
try_files {path}.html {path} {path}/index.html
file_server {
    precompressed br gzip
}
```

`precompressed` looks for the uncompressed file first, then for a sidecar per
enabled format, and answers with the sidecar and the matching
`Content-Encoding`
([file_server](https://caddyserver.com/docs/caddyfile/directives/file_server)).
Naming the two formats keeps `zstd` out of the default `br zstd gzip`: the
build writes no `.zst`, and an enabled format costs a lookup per request
whether or not its sidecar exists.

Nothing in it compares the sidecar with the file beside it. Every release
directory is written once and never edited, so inside one release they cannot
drift apart, but a release that arrived some other way is a different matter;
see the host steps.

The model's `Content-Type` is a separate question, and `precompressed` does not
depend on it. Caddy keeps no MIME table of its own: `file_server` calls Go's
`mime.TypeByExtension` and, when the extension is unknown, sends no
`Content-Type` at all rather than letting Go sniff one
(`modules/caddyhttp/fileserver/staticfiles.go`). Go's built-in table has no
`.glb`, so on Linux the answer comes from the host's `/etc/mime.types` and is
`model/gltf-binary` only if the host's media-types package carries that entry.
Nothing in the page depends on it, because the model is fetched and parsed as
bytes, but `encode`'s match does, which is the next section's problem.

### Caddy, compressing on the fly instead

```caddy
encode zstd gzip {
    match {
        header Content-Type model/gltf-binary*
        header Content-Type text/*
        header Content-Type application/json*
        header Content-Type application/javascript*
        header Content-Type application/xhtml+xml*
        header Content-Type application/wasm*
        header Content-Type font/*
        header Content-Type image/svg+xml*
    }
}
```

Three things make this the second choice. `match` replaces the default list
instead of adding to it, so every type the site still needs compressed has to
be named again and the list above covers only what this site serves. It pays
compression CPU on every request, at a lower brotli or zstd level than 11.
And it fires on the type the file server produced, so it does nothing unless
`.glb` resolves to `model/gltf-binary` on that host: check with
`curl -sI https://posvoji.si/models/our-cat/cat.glb` before relying on it.

Do not count on a `header` directive that sets `Content-Type` to steer it.
`encode` matches the type the file server produced, and which of the two
directives sees the header first is not something this document has tested.
The host's MIME table is the thing to fix.

### nginx

```nginx
gzip_static on;
brotli_static on;
```

`gzip_static` is not built by default; it needs
`--with-http_gzip_static_module`. `brotli_static` comes from the third-party
`ngx_brotli` module. Neither consults `gzip_types`: the static module takes
`gzip_http_version`, `gzip_proxied`, `gzip_disable` and `gzip_vary` into
account and nothing else
([ngx_http_gzip_static_module](https://nginx.org/en/docs/http/ngx_http_gzip_static_module.html)),
so the sidecar is served whatever the model's media type turns out to be.

For nginx compressing on the fly instead, two additions. The media type has to
be declared, because nginx's bundled `conf/mime.types` has no `glb` entry and
would otherwise call the model `application/octet-stream`, and the type then
joins the `gzip_types` list from the nginx section above:

```nginx
types {
    model/gltf-binary glb;
}

gzip_types text/css application/javascript application/json image/svg+xml application/xml model/gltf-binary;
```

### Host steps

Nothing in this repository can make the host serve the sidecars. On the
production host, in this order:

1. **Deploy once from this repository first.** The current live release
   carries about 10500 `.br`/`.gz` files from an old hand-made deploy.
   `precompressed` serves a sidecar without comparing it to the file beside it,
   so turning the directive on over that release would start serving those
   siblings, and nothing says they were written from the bytes they now sit
   next to. A release built by `scripts/deploy.sh` contains the model's two and
   nothing else.
2. **Add the subdirective** to the `file_server` in the `posvoji.si` block of
   the host Caddyfile, then `sudo caddy validate --config <path>` and
   `sudo systemctl reload caddy`.
3. **Confirm it on a real response.**

   ```bash
   curl -sI -H 'Accept-Encoding: br' https://posvoji.si/models/our-cat/cat.glb |
     grep -i 'content-encoding\|content-length'
   ```

   `br` and a length near 550,478 rather than 1,500,464. Behind the launch
   gate this answers `401`, so pass the credentials or run it after the gate
   comes off.

   The `HEAD` below takes the file server's source at its word: it sets
   `Content-Encoding` before any body is written, so a bodyless response still
   carries it. That has been seen against a stand-in server and not against
   this host. If the curl above reports `br` where the monitor reports nothing,
   that shortcut is what to drop, and a `--range` request will not replace it:
   Caddy declines to encode a partial response, so a range over an on-the-fly
   encoding arrives raw.

4. **Turn the monitor's check on.** `scripts/monitor-production.sh` asserts the
   same header with that `HEAD` on every run, but only when
   `POSVOJI_MONITOR_MODEL_ENCODING=1` is set: until step 2 lands the honest
   answer is no `Content-Encoding`, and a check that fails for a thing the site
   works without is one nobody reads. Set it in both places that run the
   script, once the curl above answers `br`:

   - `scripts/systemd/posvoji-health.service`, as a second `Environment=` line
     beside `POSVOJI_MONITOR_NETRC_FILE`, then `sudo systemctl daemon-reload`.
   - `.github/workflows/production-health.yml`, in the `env:` of the step that
     runs the script, beside `MONITOR_NETRC`.

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
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    error_page 404 /404.html;
    try_files $uri.html $uri $uri/ =404;
}

location = /404.html {
    internal;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
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
location serves it and cannot be requested directly, and it repeats the
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
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
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

Verified 20 September 2026 (Europe/Ljubljana), using the authenticated Chrome
session and its network response headers after a homepage reload: the sampled
JavaScript, CSS and both WOFF2 files returned `200` without `Cache-Control`.
For example, `/_next/static/chunks/30u6sh46bxos5.js` and
`/_next/static/media/inter-latin.2bn3s6zvc0dyp.woff2` had no cache policy.
HTML and compressible chunks carried `Content-Encoding: zstd`; the font was
served as `font/woff2`. HSTS was present with `max-age=300`.
The immutable policy below still needs to be applied on the host. No production
configuration was changed during this verification.


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
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header Cache-Control "public, max-age=31536000, immutable";
}

location ~ ^/(?:icon\.svg|favicon\.ico|apple-icon\.png)$ {
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
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
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    location /media/animals/ {
        add_header Referrer-Policy "strict-origin-when-cross-origin" always;
        add_header X-Content-Type-Options "nosniff" always;
        add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }

    location /media/shelter-logos/ {
        add_header Referrer-Policy "strict-origin-when-cross-origin" always;
        add_header X-Content-Type-Options "nosniff" always;
        add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }

    location /media/share/ {
        add_header Referrer-Policy "strict-origin-when-cross-origin" always;
        add_header X-Content-Type-Options "nosniff" always;
        add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
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
    file_server {
        precompressed br gzip
    }

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
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
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
`precompressed` is the opposite: a `file_server` subdirective, so it applies to
the release's file server alone, and the media block's stays bare because
nothing under `/media` has a sidecar.
`handle_errors` catches a missing media file as well as a missing page, which
sends the HTML body to a request that wanted an image; the status is what a
crawler reads and the body is never seen. None of this changes what
`scripts/validate-caddy-layout.cjs` inspects: it follows roots and reachable
file servers through `routes`, and Caddy adapts `handle_errors` into a separate
error chain.
