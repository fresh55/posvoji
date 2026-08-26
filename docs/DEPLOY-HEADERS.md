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
