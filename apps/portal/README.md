# Portal

Self-service API for Slovenian shelters. A shelter logs in with a magic link
and edits its own listings. The edits are stored as overrides on top of the
crawled data, never as a replacement for it: the crawler keeps writing
`data/dist/animals.json`, and the ingest pipeline pulls the overrides from
this service and applies them on export.

A few shelters publish no animal list at all. For them the portal is not a
place to correct a crawled record, it is the place the record is written, and
they get [manual listings](#manual-listings) instead of overrides.
[docs/MANUAL-LISTINGS.md](../../docs/MANUAL-LISTINGS.md) is the contract
between the three workspaces that carry such a listing to the public site.

Django 5 with django-ninja, SQLite, no Node involved. The rest of the
repository does not depend on it at build time.

## Setup

Python 3.12 and [uv](https://docs.astral.sh/uv/) are required.

```bash
cd apps/portal
uv sync
uv run python manage.py migrate
uv run python manage.py seed_shelters
uv run python manage.py runserver
```

The API is then on `http://localhost:8000/api/`, the admin on
`http://localhost:8000/admin/` and the generated OpenAPI docs on
`http://localhost:8000/api/docs`.

`seed_shelters` reads `data/shelters.yaml` and upserts one shelter per entry,
plus a login and a membership for every entry that carries an institutional
address. Nothing is duplicated when it runs again. The memberships it makes
carry the source `registry` and follow the registry: when an entry names
another address, or none at all, the membership for the old address is deleted
and that address loses portal access. A membership added by hand in `/admin`
or minted by the development login carries a different source and is never
touched. The login row itself stays, without access, because both
`/auth/request-link` and `/auth/verify` require a membership. Pass `--path` to
read another file.

It also reads `ingestion` out of `providers/<slug>/policy.yaml`, which is what
decides whether a shelter writes its own listings. A shelter with no policy
file has no adapter either, so it stays on `scrape`. Pass `--providers` to
read another directory.

For the admin you also need a superuser:

```bash
uv run python manage.py createsuperuser
```

## Tests and lint

```bash
uv run pytest
uv run ruff format .
uv run ruff check .
```

The tests run offline. They never read the real registry, the real datasets or
the real provider policies, and they never write into the checkout:
`tests/fixtures/shelters.yaml` stands in for the registry, and a temporary
directory stands in for the two dataset files, `providers/` and `MEDIA_ROOT`.

The test database is a SQLite file in that temporary directory rather than
pytest-django's in-memory default, so the journal and transaction settings
apply to the tests too. `tests/test_concurrency.py` needs it: it starts the
live server and sends ten `PUT`s at once, on one animal and on ten, and on an
in-memory database every server thread would share one connection and nothing
would run in parallel.

## How login works

1. `POST /api/auth/request-link` with an email address. If it belongs to a
   user with a shelter membership, a link is sent to it. The response is
   always 204, so the endpoint cannot be used to find out which addresses
   exist.
2. The link points at `FRONTEND_URL + /portal/prijava?token=...`. The token is
   signed by django-sesame, is valid for 24 hours and can be used only once.
   The address it goes to is a shared institutional inbox somebody reads once
   a working day, so an hour would expire before the first reading.
   The request may carry `next`, the portal page the shelter was on; the link
   then carries it URL-encoded as `nazaj`, so a tab the mail opens lands on
   that page after the login. Only a path under `/portal` that is not the
   login page and has no whitespace or control characters is taken; anything
   else is dropped without changing the response, and the value is never
   logged or stored.
3. The frontend posts the token to `POST /api/auth/verify`, which opens a
   normal Django session and sets the session cookie.

`POST /api/auth/request-link` is limited to five attempts per client IP per
hour by default. It still returns the same response for known and unknown
addresses. The direct network peer (`REMOTE_ADDR`) supplies the identity. When
that peer is loopback, the default same-host nginx/Caddy deployment trusts the
rightmost address in `X-Forwarded-For`. Other proxy topologies must explicitly
configure how many rightmost proxy hops they trust; direct non-loopback callers
cannot select their rate-limit identity with a forwarding header. A refused
request answers 429 with `Retry-After` in seconds, which is named in
`CORS_EXPOSE_HEADERS` so the login page on the other origin can read it and
say how long the wait is.

A second limit counts the recipient rather than the caller: three links per
address per hour by default, `PORTAL_LOGIN_LINK_ADDRESS_RATE`. The IP limit
does not cover this, because a caller who changes network can still make the
portal deliver to a shelter's published address again and again. Over the
limit the endpoint still answers 204 and nothing is sent, so the caller learns
nothing about the address either way. The suppressed send is written to the
log as `portal.mail.address_throttled`.

Both counters live in a file-based cache, so every process on the host sees
the same ones. `PORTAL_CACHE_DIR` is the directory, `apps/portal/cache` when
it is unset. The deployment runs gunicorn with three workers, and Django's
default local-memory cache is per process, which would multiply both limits by
the worker count.

In development the mail goes to the console, so the link is printed in the
`runserver` output.

The session cookie is `SameSite=Lax`, which works because the portal and the
API are same site in both environments (`localhost:3000` to `localhost:8000`,
`posvoji.si` to `api.posvoji.si`). CORS controls which origins can read API
responses; it does not stop a request from reaching the server. Before a
`POST` or `PUT`, the frontend gets `/api/auth/csrf`, keeps the returned
`csrfToken`, and sends it as `X-CSRFToken`. Every request also uses
`credentials: "include"` so the matching CSRF and session cookies travel with
it. Django rotates the CSRF secret when a login succeeds, so the frontend gets
a fresh token after login.

### Mail

The link is the login, so a portal that cannot send mail lets nobody in, and
the API never says so: `POST /api/auth/request-link` answers 204 whether the
message left or not. One command sends a test message through the configured
backend and prints the backend, host and port it used:

```bash
uv run python manage.py check_mail --to you@example.com
```

Exit 0 with the message received is the proof. A refused or unreachable host
is a `CommandError` carrying the backend's own message.

Two markers make the rest visible in the log, because the response cannot:

| Marker | What happened |
|---|---|
| `portal.mail.delivery_failed` | The backend raised. The shelter was told a link is on its way and none was sent. |
| `portal.mail.address_throttled` | The per-address limit suppressed the send. Nothing is wrong. |

[docs/DEPLOY-PORTAL.md](../../docs/DEPLOY-PORTAL.md) has the alert recipe for
the first one.

The From address is send-only. The mail carries `PORTAL_FROM_NAME` as its
display name and `PORTAL_REPLY_TO_EMAIL` as `Reply-To`, and prints that same
address as the one to write to with questions. `PORTAL_EMAIL_USE_TLS` is
STARTTLS on port 587 and `PORTAL_EMAIL_USE_SSL` is implicit TLS on 465;
setting both fails at startup rather than at the first send. Which of the
two the deployment uses, and why, is in
[docs/DEPLOY-PORTAL.md](../../docs/DEPLOY-PORTAL.md); it is not repeated here.

### Signing in as a shelter in development

Waiting for a mail to look at one shelter's workspace, then another, does not
work while the portal is being built. `PORTAL_DEV_LOGIN` adds two routes that
skip it. It is off unless you ask for it, so start the server with
`PORTAL_DEV_LOGIN=true` in the environment; `.env.example` already carries
the line.

```bash
curl http://localhost:8000/api/auth/dev/shelters
curl -c /tmp/portal-cookies http://localhost:8000/api/auth/csrf
curl -b /tmp/portal-cookies -X POST http://localhost:8000/api/auth/dev/login \
  -H 'Content-Type: application/json' \
  -H 'X-CSRFToken: <csrfToken from the previous response>' \
  -d '{"slug": "zonzani"}'
```

The login page shows the same list as a picker under the form, so a shelter is
one click away. Run `seed_shelters` first, or the list is empty.

`/api/auth/dev/login` signs in as the shelter's own registry login, so the
session is the one that shelter would get by mail. A shelter the registry
lists without an address gets a login at `<slug>@dev.invalid`, a reserved TLD
that can never receive anything, plus the membership to go with it.

**This is an authentication bypass.** It is off unless the variable is set,
and forced off whenever `PORTAL_DEBUG` is false, so setting the variable on a
deployment does nothing. Both routes answer 404 when it is off, so a portal
that does not have it never advertises them. On the frontend the picker is
behind `process.env.NODE_ENV`, so `pnpm --filter web build` drops the
component from the bundle.

## Routes

| Method | Path | Auth |
|---|---|---|
| GET | `/api/auth/csrf` | none; sets the CSRF cookie and returns its token |
| POST | `/api/auth/request-link` | CSRF, always 204 |
| POST | `/api/auth/verify` | CSRF, 401 on a bad token |
| POST | `/api/auth/logout` | session and CSRF, always 204 |
| GET | `/api/auth/dev/shelters` | none, 404 unless `PORTAL_DEV_LOGIN` |
| POST | `/api/auth/dev/login` | CSRF, 404 unless `PORTAL_DEV_LOGIN` |
| GET | `/api/me` | session |
| GET | `/api/shelters/{slug}/animals` | session and membership |
| PUT | `/api/shelters/{slug}/animals/{animal_id}` | session, CSRF and membership |
| GET | `/api/shelters/{slug}/listings` | session and membership, manual shelters only |
| POST | `/api/shelters/{slug}/listings` | session, CSRF and membership, manual shelters only |
| PUT | `/api/shelters/{slug}/listings/{id}` | session, CSRF and membership, manual shelters only |
| DELETE | `/api/shelters/{slug}/listings/{id}` | session, CSRF and membership, manual shelters only |
| POST | `/api/shelters/{slug}/listings/{id}/photos` | session, CSRF and membership, manual shelters only |
| DELETE | `/api/shelters/{slug}/listings/{id}/photos/{photoId}` | session, CSRF and membership, manual shelters only |
| GET | `/api/export` | `Authorization: Bearer $PORTAL_EXPORT_TOKEN` |
| GET | `/api/export/listings` | `Authorization: Bearer $PORTAL_EXPORT_TOKEN` |
| GET | `/api/docs` | none |
| any | `/admin/` | Django admin login |

An unknown slug answers 404, a slug the user is not a member of answers 403.

`GET /api/shelters/{slug}/animals` reads the dataset, keeps the animals whose
`shelter.id` is the slug, and merges each one with its override. A missing
dataset file gives an empty list. Every item carries the merged values and an
`overrides` object listing only the fields the shelter changed.

`PUT /api/shelters/{slug}/animals/{animal_id}` records the crawl's current
value for the fields it sets, see [Overrides and the
crawl](#overrides-and-the-crawl). It takes any subset of `name`,
`shortDescription`, `status`, `sex`, `breed`, `birthDate`,
`approximateAgeMonths`, `size`, `energy`, `goodWithKids`, `goodWithDogs` and
`goodWithCats`. `energy` takes `calm`, `balanced` or `lively`; almost no
shelter site states it in a form the crawler can read, so for most animals
this is where it comes from. The three good-with fields take `yes`, `no` or
`unknown`;
`unknown` is the shelter answering, an absent field is not. A field that is
absent from the body is left alone, an explicit `null` clears the override and
the crawled value applies again. Unknown fields are rejected with 422, and so
are `approximateAgeMonths` above 1200 (a hundred years, the web client's cap)
and a `birthDate` in the future or before 1900-01-01. Control characters
other than tab and newline are dropped from text, and line ends become `\n`.
The animal does not have to exist in the dataset yet, because the shelter
can be ahead of the crawl.

The id has to be one of the shelter's own: ingest names every animal
`<shelter slug>:<local id>`, so an id with another prefix, an empty local id
or a control character anywhere in it answers 404 `animal not found` and
writes nothing, whichever shelter's route it arrives on.

An override with no stated value does not exist. A body that clears the last
field deletes the row, and an empty body on an animal without one creates
nothing, so `updated_at` never says a shelter edited an animal it did not.

The listing flattens the dataset's nested `goodWith` block into
`goodWithKids`, `goodWithDogs` and `goodWithCats`, one key per group, the same
shape the override takes.

## Export for the ingest pipeline

```bash
curl -H "Authorization: Bearer $PORTAL_EXPORT_TOKEN" http://localhost:8000/api/export
```

```json
{
  "generatedAt": "2026-08-18T09:00:00Z",
  "overrides": [
    {
      "providerId": "zonzani",
      "animalId": "zonzani:123",
      "fields": { "name": "Bela", "status": "reserved", "birthDate": "2024-05-01" },
      "baseline": { "name": "bela", "status": "available", "birthDate": null },
      "recordedAt": "2026-08-17T09:30:00Z"
    }
  ]
}
```

`providerId` is the shelter slug, which is also the provider id in the
dataset. `fields` holds only the columns the shelter actually set. Rows with
no set column are left out. These key names are a contract with the
TypeScript side, so changing them means changing `apps/ingest` in the same
commit.

`baseline` holds what the crawl said for those same fields at the moment the
shelter set them, and `recordedAt` is when that reading was taken. It moves
only when the reading does: a shelter saying the same thing again while the
crawl stands still, or sending an empty body, leaves both alone. A value of
`null` means the crawl stated nothing for that field then, which is a
reading; a field missing from `baseline` means nothing was read at all,
because the animal was not in the dataset yet. Both keys are left out
entirely when a row has no baseline. Ingest uses them to tell a source that
has moved from a correction that simply differs from the crawl.

Without `PORTAL_EXPORT_TOKEN` the endpoint answers 503, with a wrong or
missing bearer token 401.

### Running it offline

The ingest side reads `PORTAL_EXPORT_URL` and `PORTAL_EXPORT_TOKEN`, and
skips overrides entirely when both are unset. With exactly one of them set it
refuses the run, so a lost secret cannot silently drop every correction. Set
`PORTAL_EXPORT_FIXTURE` to
the path of a saved export instead and it reads that file, so the merge, the
conflict report and the sidecar can all be exercised without a deployment.
The fixture wins over the URL when both are set, which is what makes it
usable to reproduce a run against a captured payload.

```bash
curl -H "Authorization: Bearer $PORTAL_EXPORT_TOKEN" http://localhost:8000/api/export > /tmp/export.json
PORTAL_EXPORT_FIXTURE=/tmp/export.json pnpm --filter @posvoji/ingest export
```

`apps/ingest/fixtures/portal-export.example.json` is a small saved payload
covering a baseline, a null baseline value and an override matching no
animal.

## Overrides and the crawl

A correction and the crawled value differ by definition, so comparing those
two says nothing. What matters is whether the source has moved since the
shelter recorded the correction, which takes three values per field:

| | |
|---|---|
| baseline | what the crawl said when the shelter recorded the correction |
| crawled | what the crawl says now |
| override | what the shelter set, and what still ships |

The baseline is taken in `PUT /api/shelters/{slug}/animals/{animal_id}`, for
the fields in that request only. Clearing a field drops its baseline with it,
and setting a field again re-takes the baseline, which is how a shelter says
"I still mean this". An animal that is not in the dataset yet gets no
baseline, because there is nothing to read.

### The two dataset files

One ingest run writes two files. `data/dist/animals.json` is what the site
reads: the crawl with the overrides merged in. `data/dist/animals.crawled.json`
is the same run's records before any override was merged. The portal reads
both, for different questions:

- `GET /api/shelters/{slug}/animals` reads `DATASET_PATH`, the merged file,
  and applies the shelter's overrides on top. That is the view the shelter
  expects, and an override set or cleared since the last run lands on it.
- The baseline in `PUT` and the crawl state in the admin read
  `CRAWLED_DATASET_PATH`. Read off the merged file, the baseline of an
  override the last run applied would be that override's own value, and
  every correction would look like a crawl that caught up.

A `data/dist` from before ingest wrote the crawled file has only the merged
one. The portal then reads baselines from it, as it always did, and logs one
warning per process saying so.

`core/conflicts.py` compares the three and reports two kinds:

- **source moved.** The crawl has changed and still disagrees with the
  shelter. Somebody has to pick a side.
- **crawl caught up.** The crawl has changed and now agrees with the shelter.
  Nothing is wrong on the site, the override is simply redundant.

**The correction keeps winning either way, indefinitely.** Nothing expires and
nothing is resolved automatically. A conflict changes what is reported, not
what ships. That is deliberate: silently handing an animal back to the crawl
would undo a shelter that knows something the website has not caught up with
yet.

### Reviewing them

The admin changelist at `/admin/core/animaloverride/` has a **crawl state**
column and filter with four states: source moved, crawl caught up, no
matching animal, and in step with the crawl. Filtering to "source moved" is
the review queue.

Two actions resolve a selection:

- **Accept the crawl for conflicting fields** clears the shelter's value for
  the conflicting fields only. The rest of the correction is untouched.
- **Keep the correction, clear the conflict** re-takes the baseline. What the
  site shows does not change; this records that a human has seen where the
  source moved to and still prefers the shelter's answer.

The crawled values live in a JSON file rather than in the database, so the
filter cannot be a plain field filter. It resolves the rows in Python and
hands the queryset a list of primary keys, reading the dataset once per page.

The ingest run reports the same thing from the other side: it names every
moved field in its log and writes the full audit trail to
`data/dist/overrides.json` next to the dataset, listing what was applied,
what matched no animal, and what conflicts. Unmatched overrides carry their
`recordedAt`, which is how one that has quietly outlived its animal becomes
visible. Nothing about this goes into `animals.json` itself: that file is
what the site reads, and per-field provenance would be a schema change
nothing on the site renders.

## Manual listings

A shelter is manual when its `providers/<slug>/policy.yaml` says
`ingestion: manual`. Such a shelter publishes no catalogue for the crawler to
read, so it writes the animal here instead. A manual listing is not an
override: there is no crawled record underneath it, the row holds the whole
animal, and ingest reads it at the crawl phase as if a provider had returned
it. `GET /api/me` reports `ingestion` on every shelter, which is how the
workspace knows which editor to open.

The listing routes answer 404 for a crawled shelter, even to one of its own
members. They are not a permission that shelter is missing: the crawl is the
origin of its animals and a listing would duplicate one on the next run.

`POST` and `PUT` take the whole listing. `species` and `name` are required,
`status` defaults to `available`, and every other field is optional with the
same limits as an override. `PUT` is a full replace, so a field left out of
the body is cleared. `DELETE` archives: the listing leaves the API and the
export, its uuid is never handed out again, and the next ingest run removes
the animal through the same path a crawled animal leaves by.

### Photos

`POST /api/shelters/{slug}/listings/{id}/photos` takes one multipart `file`.
JPEG, PNG and WebP are accepted, up to 15 MB, and the format is decided by
opening the file rather than by the client's content-type.

Nothing arrives and is stored as it is. The portal puts the image the right
way up from its EXIF orientation, caps the longest side at 2048 px, and
re-encodes it as a progressive JPEG from a blank canvas. That last step is
what drops the EXIF block and with it the GPS position of the phone that took
the photograph. The file is named after the SHA-256 of the bytes written and
stored at `MEDIA_ROOT/listings/<listing id>/<hash>.jpg`; the recorded width
and height are the stored copy's.

Because the name is a function of the listing and the bytes, sending the same
photograph twice is recognised before the second copy reaches the disk: the
response is the photo that is already there, with 200 rather than 201.

Django serves `MEDIA_URL` itself while `PORTAL_DEBUG` is on. **In production
nginx serves `PORTAL_MEDIA_ROOT` at `/media/` on `api.posvoji.si` and Django
never sees those requests**, so the directory has to be readable by the web
server and has to survive a redeploy. `PORTAL_PUBLIC_URL` is prefixed onto
every photo URL in the export, because the ingest pipeline fetches them from
another host.

### Export for the ingest pipeline

```bash
curl -H "Authorization: Bearer $PORTAL_EXPORT_TOKEN" \
  http://localhost:8000/api/export/listings
```

```json
{
  "generatedAt": "2026-09-01T12:00:00Z",
  "listings": [
    {
      "providerId": "johanca",
      "id": "6d1c0f6a-3c0e-4a7e-9f7b-2f4a9d1e8b10",
      "species": "cat",
      "status": "available",
      "name": "Luna",
      "sex": "female",
      "photos": [
        {
          "url": "https://api.posvoji.si/media/listings/6d1c0f6a-3c0e-4a7e-9f7b-2f4a9d1e8b10/3f2a9c1d.jpg",
          "width": 1600,
          "height": 1200
        }
      ],
      "createdAt": "2026-09-01T10:00:00Z",
      "updatedAt": "2026-09-01T11:30:00Z"
    }
  ]
}
```

`providerId`, `id`, `species`, `status`, `name`, `photos`, `createdAt` and
`updatedAt` are always present. Every other field is present when set and
absent when not, never `null`, which maps one to one onto the `Animal`
schema's optional fields. Archived listings are not exported, and neither are
the listings of a shelter that is no longer manual: the crawl provides its
animals again, so both sources would produce the same animal twice.

`apps/ingest/fixtures/portal-listings.contract.json` is the authoritative
shape. `tests/test_export_listings.py` asserts this side against it and the
ingest's zod schema parses the same file, so changing one side means changing
the other in the same commit.

## Environment

Defaults are meant for local development. `.env.example` lists the same
variables.

| Variable | Default | Meaning |
|---|---|---|
| `PORTAL_SECRET_KEY` | random per process | Django signing key. An unset development key invalidates sessions and login links on restart; production startup fails unless a private value is set. |
| `PORTAL_DEBUG` | `true` | Set to `false` in production. |
| `PORTAL_ALLOWED_HOSTS` | `localhost,127.0.0.1` | Comma separated hosts. |
| `PORTAL_DB_PATH` | `apps/portal/db.sqlite3` | SQLite file. |
| `PORTAL_DB_TIMEOUT` | `20` | Seconds a writer waits for the database lock before it fails. |
| `PORTAL_DB_INIT_COMMAND` | `PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;` | Statements run on every new connection, `;` separated. |
| `FRONTEND_URL` | `http://localhost:3000` | Base of the magic link. |
| `CORS_ORIGINS` | `http://localhost:3000` | Comma separated origins allowed to send credentials. |
| `DATASET_PATH` | `data/dist/animals.json` | The merged dataset the site reads, read only. What the listing shows. |
| `CRAWLED_DATASET_PATH` | `data/dist/animals.crawled.json` | The same run's records before any override was merged, read only. What baselines and the crawl state compare against; `DATASET_PATH` stands in when it is missing. |
| `SHELTERS_YAML` | `data/shelters.yaml` | Registry read by `seed_shelters`. |
| `PROVIDERS_DIR` | `providers/` | Where `seed_shelters` reads each `<slug>/policy.yaml` for its `ingestion` mode. |
| `PORTAL_MEDIA_ROOT` | `apps/portal/media` | Uploaded listing photographs. Served by nginx in production. |
| `PORTAL_PUBLIC_URL` | `http://localhost:8000` | Where this service answers from. Prefixed onto every photo URL in the export. |
| `PORTAL_EXPORT_TOKEN` | unset | Bearer token for `/api/export` and `/api/export/listings`. Unset disables both. |
| `PORTAL_DEV_LOGIN` | `false`, and forced off whenever `PORTAL_DEBUG` is off | Enables the development shelter picker. |
| `PORTAL_SECURE_COOKIES` | `false` when `PORTAL_DEBUG` is on | Marks the session cookie secure. |
| `PORTAL_SESSION_COOKIE_DOMAIN` | unset | Set only if the cookie has to span subdomains. |
| `PORTAL_SESSION_AGE` | `1209600` | Session lifetime in seconds. |
| `PORTAL_LOGIN_LINK_RATE` | `5/hour` | Maximum accepted login-link requests per client IP. Counted in the cache below. |
| `PORTAL_LOGIN_LINK_ADDRESS_RATE` | `3/hour` | Maximum login links sent to one address. Over it the endpoint still answers 204 and sends nothing. Read at startup, so a rate that is malformed or allows nothing stops the process rather than the login. |
| `PORTAL_CACHE_DIR` | `apps/portal/cache` | File-based cache holding both counters. Shared by every worker process on the host, and must be writable by the service. |
| `PORTAL_TRUSTED_PROXY_COUNT` | unset | Number of trusted rightmost proxy hops in `X-Forwarded-For`. Unset trusts one hop only when `REMOTE_ADDR` is loopback; `0` always uses `REMOTE_ADDR`. |
| `PORTAL_EMAIL_BACKEND` | console when `PORTAL_DEBUG` is on, otherwise SMTP | Django email backend. |
| `PORTAL_EMAIL_HOST` | `localhost` | SMTP host. |
| `PORTAL_EMAIL_PORT` | `25` | SMTP port. |
| `PORTAL_EMAIL_USER` | empty | SMTP user. |
| `PORTAL_EMAIL_PASSWORD` | empty | SMTP password. |
| `PORTAL_EMAIL_USE_TLS` | `false` | STARTTLS, port 587. |
| `PORTAL_EMAIL_USE_SSL` | `false` | Implicit TLS, port 465. Setting this and `PORTAL_EMAIL_USE_TLS` together fails at startup. |
| `PORTAL_EMAIL_TIMEOUT` | `10` | Seconds each socket operation of a send waits, not the send as a whole. Sending is synchronous inside the request. Must be a positive integer. |
| `PORTAL_FROM_EMAIL` | `portal@posvoji.si` | Sender of the login mail. Must be the mailbox `PORTAL_EMAIL_USER` authenticates as. |
| `PORTAL_FROM_NAME` | `Posvoji.si` | Display name on the From address. |
| `PORTAL_REPLY_TO_EMAIL` | `info@posvoji.si` | `Reply-To`, and the address the mail prints for questions. The From address is send-only. |

Every transaction opens `IMMEDIATE`, which takes SQLite's write lock at
`BEGIN` rather than at the first write. That is what makes two requests that
edit at once queue on `PORTAL_DB_TIMEOUT` instead of one of them failing with
"database is locked", and it is not configurable: the override route relies
on it to serialize its read-modify-write, because SQLite ignores
`select_for_update`. WAL lets reads go on while a writer holds the lock.

In production set at least `PORTAL_SECRET_KEY`, `PORTAL_DEBUG=false`,
`PORTAL_ALLOWED_HOSTS`, `FRONTEND_URL`, `CORS_ORIGINS`, `PORTAL_EXPORT_TOKEN`,
`PORTAL_PUBLIC_URL` and the SMTP variables, then run `manage.py migrate`,
`manage.py seed_shelters` and `manage.py collectstatic`. Point nginx at
`PORTAL_MEDIA_ROOT` for `/media/`: Django only serves it while `PORTAL_DEBUG`
is on.

## Data rules

The registry addresses in `data/shelters.yaml` are institutional, and they are
the only contact data this service stores. No personal data of private
individuals belongs in the database, in fixtures or in tests, the same rule
the rest of the repository follows.

## License

AGPL-3.0-only, like everything else under `apps/`.
