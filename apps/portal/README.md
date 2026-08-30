# Portal

Self-service API for Slovenian shelters. A shelter logs in with a magic link
and edits its own listings. The edits are stored as overrides on top of the
crawled data, never as a replacement for it: the crawler keeps writing
`data/dist/animals.json`, and the ingest pipeline pulls the overrides from
this service and applies them on export.

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
address. It is safe to run again after the registry changes: nothing is
duplicated and nothing is deleted. Pass `--path` to read another file.

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

The tests run offline. They never read the real registry or the real dataset:
`tests/fixtures/shelters.yaml` and a temporary dataset file stand in for both.

## How login works

1. `POST /api/auth/request-link` with an email address. If it belongs to a
   user with a shelter membership, a link is sent to it. The response is
   always 204, so the endpoint cannot be used to find out which addresses
   exist.
2. The link points at `FRONTEND_URL + /portal/prijava?token=...`. The token is
   signed by django-sesame and is valid for one hour.
3. The frontend posts the token to `POST /api/auth/verify`, which opens a
   normal Django session and sets the session cookie.

In development the mail goes to the console, so the link is printed in the
`runserver` output.

The session cookie is `SameSite=Lax`, which works because the portal and the
API are same site in both environments (`localhost:3000` to `localhost:8000`,
`posvoji.si` to `api.posvoji.si`). Cross site requests are rejected by CORS,
so the API endpoints do not carry a CSRF token of their own. The frontend has
to send its requests with `credentials: "include"`.

### Signing in as a shelter in development

Waiting for a mail to look at one shelter's workspace, then another, does not
work while the portal is being built. `PORTAL_DEV_LOGIN` adds two routes that
skip it. It is off unless you ask for it, so start the server with
`PORTAL_DEV_LOGIN=true` in the environment; `.env.example` already carries
the line.

```bash
curl http://localhost:8000/api/auth/dev/shelters
curl -X POST http://localhost:8000/api/auth/dev/login   -H 'Content-Type: application/json' -d '{"slug": "zonzani"}'
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
| POST | `/api/auth/request-link` | none, always 204 |
| POST | `/api/auth/verify` | none, 401 on a bad token |
| POST | `/api/auth/logout` | none, always 204 |
| GET | `/api/auth/dev/shelters` | none, 404 unless `PORTAL_DEV_LOGIN` |
| POST | `/api/auth/dev/login` | none, 404 unless `PORTAL_DEV_LOGIN` |
| GET | `/api/me` | session |
| GET | `/api/shelters/{slug}/animals` | session and membership |
| PUT | `/api/shelters/{slug}/animals/{animal_id}` | session and membership |
| GET | `/api/export` | `Authorization: Bearer $PORTAL_EXPORT_TOKEN` |
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
the crawled value applies again. Unknown fields are rejected with 422. The
animal does not have to exist in the dataset yet, because the shelter can be
ahead of the crawl.

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
shelter set them, and `recordedAt` is when that reading was taken. A value of
`null` means the crawl stated nothing for that field then, which is a
reading; a field missing from `baseline` means nothing was read at all,
because the animal was not in the dataset yet. Both keys are left out
entirely when a row has no baseline. Ingest uses them to tell a source that
has moved from a correction that simply differs from the crawl.

Without `PORTAL_EXPORT_TOKEN` the endpoint answers 503, with a wrong or
missing bearer token 401.

### Running it offline

The ingest side reads `PORTAL_EXPORT_URL` and `PORTAL_EXPORT_TOKEN`, and
skips overrides entirely when either is unset. Set `PORTAL_EXPORT_FIXTURE` to
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

## Environment

Defaults are meant for local development. `.env.example` lists the same
variables.

| Variable | Default | Meaning |
|---|---|---|
| `PORTAL_SECRET_KEY` | insecure dev value | Django secret key. Required in production. |
| `PORTAL_DEBUG` | `true` | Set to `false` in production. |
| `PORTAL_ALLOWED_HOSTS` | `localhost,127.0.0.1` | Comma separated hosts. |
| `PORTAL_DB_PATH` | `apps/portal/db.sqlite3` | SQLite file. |
| `FRONTEND_URL` | `http://localhost:3000` | Base of the magic link. |
| `CORS_ORIGINS` | `http://localhost:3000` | Comma separated origins allowed to send credentials. |
| `DATASET_PATH` | `data/dist/animals.json` | Crawled dataset, read only. |
| `SHELTERS_YAML` | `data/shelters.yaml` | Registry read by `seed_shelters`. |
| `PORTAL_EXPORT_TOKEN` | unset | Bearer token for `/api/export`. Unset disables the endpoint. |
| `PORTAL_DEV_LOGIN` | `false`, and forced off whenever `PORTAL_DEBUG` is off | Enables the development shelter picker. |
| `PORTAL_SECURE_COOKIES` | `false` when `PORTAL_DEBUG` is on | Marks the session cookie secure. |
| `PORTAL_SESSION_COOKIE_DOMAIN` | unset | Set only if the cookie has to span subdomains. |
| `PORTAL_SESSION_AGE` | `1209600` | Session lifetime in seconds. |
| `PORTAL_EMAIL_BACKEND` | console when `PORTAL_DEBUG` is on, otherwise SMTP | Django email backend. |
| `PORTAL_EMAIL_HOST` | `localhost` | SMTP host. |
| `PORTAL_EMAIL_PORT` | `25` | SMTP port. |
| `PORTAL_EMAIL_USER` | empty | SMTP user. |
| `PORTAL_EMAIL_PASSWORD` | empty | SMTP password. |
| `PORTAL_EMAIL_USE_TLS` | `false` | STARTTLS for SMTP. |
| `PORTAL_FROM_EMAIL` | `portal@posvoji.si` | Sender of the login mail. |

In production set at least `PORTAL_SECRET_KEY`, `PORTAL_DEBUG=false`,
`PORTAL_ALLOWED_HOSTS`, `FRONTEND_URL`, `CORS_ORIGINS`, `PORTAL_EXPORT_TOKEN`
and the SMTP variables, then run `manage.py migrate`, `manage.py
seed_shelters` and `manage.py collectstatic`.

## Data rules

The registry addresses in `data/shelters.yaml` are institutional, and they are
the only contact data this service stores. No personal data of private
individuals belongs in the database, in fixtures or in tests, the same rule
the rest of the repository follows.

## License

AGPL-3.0-only, like everything else under `apps/`.
