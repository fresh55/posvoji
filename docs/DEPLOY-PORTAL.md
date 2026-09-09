# Deploy: the shelter portal

`apps/web` is a static export. `apps/portal` is not: it is a Django service
with a database, uploaded files and a login, and nothing on the production
host runs it today. This is what standing it up takes, in the order it has to
happen.

The web deploy is `scripts/deploy.sh` and is unaffected by any of this. The
portal is a second thing on the same box, reached on its own hostname.

## What the frontend already expects

`apps/web/lib/portal-api.ts` defaults to `https://api.posvoji.si` in a
production build, so the hostname is not a free choice unless
`NEXT_PUBLIC_PORTAL_API` is set at build time. The session cookie is
`SameSite=Lax`, which works because `posvoji.si` and `api.posvoji.si` are the
same site. Serving the API under a different registrable domain breaks the
login without any code change saying so.

## Before anything on the host

1. **DNS.** An `A` record for `api.posvoji.si` pointing at `116.203.202.17`.
   The zone is at Neoserv, not cPanel and not Hetzner. Caddy cannot issue a
   certificate until this resolves.
2. **Firewall.** Nothing to change. The API answers on 443, which the Hetzner
   Cloud Firewall `posvoji-web` and the host's UFW already allow. A new port
   would need a rule in **both** places; see the note in DEPLOY-HEADERS.md.
3. **Decide about `basic_auth`.** `posvoji.si` sits behind Caddy `basic_auth`
   today, so the site is not public. The portal UI lives at `/portal` on that
   same host, which means a shelter cannot reach the portal at all until the
   gate comes off, whatever the API does. The API's own hostname must **not**
   be behind `basic_auth`: it has its own login, and a browser cannot answer a
   basic-auth challenge on a cross-origin XHR. For the shelter demo the gate
   gets a password page in front of it, DEMO-GATE.md, and `basic_auth` stays
   underneath for the health checks.

## Host prerequisites

Python 3.12 and `uv`, plus a place for the service to live:

```bash
sudo apt-get update && sudo apt-get install -y python3.12 python3.12-venv
curl -LsSf https://astral.sh/uv/install.sh | sudo -u posvoji sh

sudo -u posvoji mkdir -p /srv/posvoji/portal          # code
sudo -u posvoji mkdir -p /srv/posvoji/portal-data     # database
sudo -u posvoji mkdir -p /srv/posvoji/portal-media    # uploads
sudo chmod 750 /srv/posvoji/portal-data
sudo chown posvoji:caddy /srv/posvoji/portal-media
sudo chmod 750 /srv/posvoji/portal-media
```

`portal-media` is group-readable by `caddy` because Caddy serves those files
directly. `portal-data` is not: nothing but the service reads the database.

Both directories are outside the release tree on purpose, for the same reason
`/srv/posvoji/media` is: they outlive any one deploy. See DEPLOY-MEDIA.md.

## The environment file

`/srv/posvoji/portal.env`, owned `posvoji:posvoji`, mode `600`. Start from
`apps/portal/.env.production.example`. Two values must be generated, never
copied from anywhere:

```bash
python3 -c 'import secrets; print(secrets.token_urlsafe(64))'   # PORTAL_SECRET_KEY
python3 -c 'import secrets; print(secrets.token_urlsafe(48))'   # PORTAL_EXPORT_TOKEN
```

`PORTAL_EXPORT_TOKEN` is the one the crawl host already sends as
`PORTAL_EXPORT_TOKEN` for `/api/export`; the listings feed reuses it. Set the
same value in the crawl clone's environment, or ingest gets 401 and carries
every shelter forward.

`PORTAL_DEBUG` must be `false`. The dev login (`PORTAL_DEV_LOGIN`) is forced
off whenever debug is off, but set it to `false` explicitly anyway so the file
does not read as if it were available.

## The service

`/etc/systemd/system/posvoji-portal.service`:

```ini
[Unit]
Description=Posvoji.si shelter portal
After=network-online.target
Wants=network-online.target

[Service]
User=posvoji
Group=posvoji
# The directory holding pyproject.toml, not the repository root: that is what
# uv resolves the environment from. seed_shelters still reaches the registry
# and the policies, which it locates relative to the repository above this.
WorkingDirectory=/srv/posvoji/portal/apps/portal
EnvironmentFile=/srv/posvoji/portal.env
ExecStart=/home/posvoji/.local/bin/uv run --no-sync gunicorn portal.wsgi:application \
    --bind 127.0.0.1:8001 \
    --workers 3 \
    --timeout 60 \
    --access-logfile - \
    --error-logfile -
Restart=on-failure
RestartSec=5

# The service reads its code, writes its database and its uploads, and needs
# nothing else on the box.
NoNewPrivileges=true
PrivateTmp=true
PrivateDevices=true
ProtectSystem=strict
ProtectHome=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX
RestrictNamespaces=true
LockPersonality=true
MemoryDenyWriteExecute=false
ReadWritePaths=/srv/posvoji/portal-data /srv/posvoji/portal-media

[Install]
WantedBy=multi-user.target
```

Bound to loopback: Caddy is the only thing that may reach it.
`MemoryDenyWriteExecute` stays off because Pillow's decoders need it.
`ReadWritePaths` is the whole write surface, so a bug in the upload path
cannot write into the release tree.

## Caddy

A new site block, not a path on the existing one. Add it beside the
`posvoji.si` block and reload:

```caddy
api.posvoji.si {
    encode zstd gzip

    header {
        Referrer-Policy "strict-origin-when-cross-origin"
        X-Content-Type-Options "nosniff"
    }

    # Uploaded photographs, served straight off disk. Content-hashed names,
    # so they are safe to cache for a year. Ingest fetches these on its runs
    # and the public site serves its own derived copies, so this path is read
    # by the pipeline far more often than by a person.
    handle_path /media/* {
        root * /srv/posvoji/portal-media
        header Cache-Control "public, max-age=31536000, immutable"
        file_server
    }

    handle {
        # 20 MB: the portal caps an upload at 15 MB and answers 413 itself,
        # which is a better message than Caddy's. This is the backstop.
        request_body {
            max_size 20MB
        }
        reverse_proxy 127.0.0.1:8001
    }
}
```

No `basic_auth` here, deliberately. Caddy's `reverse_proxy` sets
`X-Forwarded-For`, and the portal trusts one hop from loopback, which is what
the login-link rate limit counts on.

That limit and the per-address one are counters in a file-based cache, and the
shared cache is what makes `--workers 3` correct: a per-process cache would
multiply both limits by the worker count. `PORTAL_CACHE_DIR` is
`/srv/posvoji/portal-data/cache`, inside the `ReadWritePaths` the unit already
has, so the unit does not change. The directory is created on first use.

## First deploy

```bash
# On the host, as posvoji. Code only; the database and media are elsewhere.
cd /srv/posvoji/portal
git clone --depth 1 https://github.com/fresh55/posvoji.git .   # or rsync a build
cd apps/portal
uv sync --frozen --group prod    # --group prod is what brings in gunicorn

set -a && . /srv/posvoji/portal.env && set +a
uv run python manage.py migrate
uv run python manage.py seed_shelters
uv run python manage.py createsuperuser   # for /admin

sudo systemctl daemon-reload
sudo systemctl enable --now posvoji-portal
sudo systemctl reload caddy
```

`seed_shelters` reads `data/shelters.yaml` and `providers/*/policy.yaml`, so
the clone must be the whole repository, not just `apps/portal`.

`migrate` matters on an upgrade too, not only here: `0007` adds a source to
every shelter membership and marks the rows that already exist as `registry`,
which is what lets `seed_shelters` withdraw an address the registry has
dropped without touching a membership made by hand in `/admin`.

## Verify, in this order

```bash
# 1. The service is up and only on loopback.
sudo systemctl status posvoji-portal
sudo ss -lntp | grep 8001          # 127.0.0.1:8001, never 0.0.0.0

# 2. TLS and routing.
curl -sS -o /dev/null -w '%{http_code}\n' https://api.posvoji.si/api/auth/csrf   # 200

# 3. The export token works and the feed is shaped right.
curl -sS -H "Authorization: Bearer $PORTAL_EXPORT_TOKEN" \
     https://api.posvoji.si/api/export/listings | jq '{providers, n: (.listings|length)}'

# 4. Without the token it is refused, not served.
curl -sS -o /dev/null -w '%{http_code}\n' https://api.posvoji.si/api/export/listings   # 401

# 5. The mirror agrees with the policies. Both slugs must appear.
#    If one is missing, seed_shelters has not run against the current policies
#    and ingest will carry that shelter forward rather than empty it.
curl -sS -H "Authorization: Bearer $PORTAL_EXPORT_TOKEN" \
     https://api.posvoji.si/api/export/listings | jq -r '.providers[]'
```

Then, from the crawl clone, one scoped run before any scheduled one:

```bash
PORTAL_EXPORT_URL=https://api.posvoji.si PORTAL_EXPORT_TOKEN=... \
  pnpm --filter @posvoji/ingest export --provider johanca
```

Exit 0 with `portal listings: N listed, 0 skipped` is the whole chain working.
Exit 2 with an unanswered provider means the mirror is stale: re-run
`seed_shelters`.

**None of this makes the login usable yet.** The mailed link points at
`posvoji.si/portal/prijava`, and `posvoji.si` is behind Caddy `basic_auth`, so
the link lands on a password prompt no shelter can answer. `api.posvoji.si` is
already open, so everything above passes while the login stays unreachable.
Taking the gate off the site is the launch, and it is a separate decision from
this deploy.

## Mail

The login is a mailed link, so a portal that cannot send mail lets nobody in,
and it fails quietly: `POST /api/auth/request-link` answers 204 whether the
message left or not.

Submission goes through Neoserv, authenticated as a posvoji.si mailbox.
**`PORTAL_EMAIL_USER` and `PORTAL_FROM_EMAIL` must be the same mailbox**, or
the server may refuse the sender. The cPanel plan carries one mailbox and it is
`info@posvoji.si`, so that address is the sender, the authenticated user and
the Reply-To. The zone and the mail are at Neoserv, not on this host, and not
at Hetzner.

The endpoint is `eh3.neoserv.si` on 587, which opens in the clear and upgrades
with STARTTLS. This is what the first deploy proved on 2026-09-07:

```ini
PORTAL_EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend
PORTAL_EMAIL_HOST=eh3.neoserv.si
PORTAL_EMAIL_PORT=587
PORTAL_EMAIL_USER=info@posvoji.si
PORTAL_EMAIL_PASSWORD=
PORTAL_EMAIL_USE_TLS=true
PORTAL_EMAIL_USE_SSL=false
PORTAL_EMAIL_TIMEOUT=10
PORTAL_FROM_EMAIL=info@posvoji.si
PORTAL_FROM_NAME=Posvoji.si
PORTAL_REPLY_TO_EMAIL=info@posvoji.si
```

Port 465 with `PORTAL_EMAIL_USE_SSL=true` instead is TLS from the first byte.
Neoserv documents it, but the connection from this host times out, which costs
`PORTAL_EMAIL_TIMEOUT` seconds of a worker per attempt and delivers nothing.
Stay on 587. Never set both flags: the process refuses to start.

Once the environment file is loaded, prove it before a shelter does:

```bash
set -a && . /srv/posvoji/portal.env && set +a
uv run python manage.py check_mail --to <your address>
```

Exit 0 with the message actually received is the proof. The command prints the
backend, host and port it used, so a run that reaches the console backend is
visible rather than mistaken for a success.

### Watching it afterwards

A send that fails later is only in the log, because the endpoint still answers
204:

```bash
journalctl -u posvoji-portal --since -1d -g portal.mail.delivery_failed
```

`/etc/cron.d/posvoji-portal-mail`, which reports only when there is something
to report, because cron mails a job's output and nothing else:

```cron
MAILTO=info@posvoji.si
15 7 * * * root journalctl -u posvoji-portal --since -1d --no-pager -g portal.mail.delivery_failed | grep .
```

That needs a local MTA for cron's own mail; without one, send the same command
somewhere else. The other marker, `portal.mail.address_throttled`, is the
per-address limit doing its job and is not an alert.

## Backups

There are none on this box today, and the portal is the first thing on it
holding data that is not reproducible from the repository. A crawled animal
can be re-crawled; a manual listing and its photographs exist nowhere else.

At minimum, before the first shelter writes anything real:

```bash
sqlite3 /srv/posvoji/portal-data/db.sqlite3 ".backup '/srv/posvoji/backups/portal-$(date +%F).sqlite3'"
tar -C /srv/posvoji -czf /srv/posvoji/backups/portal-media-$(date +%F).tgz portal-media
```

on a timer, with the results copied off the box. Treat this as part of the
deploy, not as a follow-up.

## Where this has and has not been exercised

Every command here was written against the code in this repository and the
host as `production-deploy` describes it, but the host has not run any of it:
SSH to `116.203.202.17` is pinned by UFW to one address and the current one is
not it, so nothing below the "Before anything on the host" section has been
executed anywhere. Treat the first run as a rehearsal, one step at a time,
with the verification block after each.

What has been exercised, locally and end to end: the service under
`manage.py runserver`, the login, the listing routes, the upload path, the
export feed, and `pnpm --filter @posvoji/ingest export --provider johanca`
against it, producing animals with cached photographs in `data/dist`. What
that does not cover is exactly what this document is about: TLS, the proxy,
the unit, the paths and the permissions.

## What is not covered here

- A rollback path. The web deploy keeps three releases and a symlink; this
  service has neither yet.
- Log shipping and uptime monitoring. `journalctl -u posvoji-portal` is the
  only view of the service today.
