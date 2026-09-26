# Portal

Django API for shelter logins, corrections to crawled animals and manual
listings. Uses Python 3.12, uv and SQLite.

## Setup

```bash
cd apps/portal
uv sync
uv run python manage.py migrate
uv run python manage.py seed_shelters
uv run python manage.py createsuperuser
uv run python manage.py runserver
```

Local endpoints: [API docs](http://localhost:8000/api/docs) and
[Django admin](http://localhost:8000/admin/).
Login links print to the server console in development.

Configuration: [.env.example](.env.example). Load variables into the environment
before starting the server. For production, follow the
[deployment guide](../../docs/DEPLOY-PORTAL.md).

## Shelter access

`seed_shelters` reads `data/shelters.yaml` and provider policies. A registry
login requires an institutional email, an enabled provider, granted permission
and a recognized ingestion mode. Rerunning the command updates existing rows.

- Changing or clearing an email removes its old registry membership.
- Disabling a provider or removing permission removes its registry memberships.
- Shelters missing from the registry are reported. Remove their registry
  memberships with `seed_shelters --prune` after checking the input is complete.
  An empty registry with `--prune` revokes all registry memberships.
- Admin and development memberships, users and edit history are preserved.
- Use `--path` and `--providers` for alternative registry and policy locations.

To add an approved institutional mailbox, reuse or create an active user in
`/admin/`, disable password authentication, leave staff/superuser permissions
off, and add a shelter membership with source `admin`. This sends no invitation.
The admin rejects duplicate email addresses regardless of case.

To replace a mailbox, add the new user's membership and remove the old one.
Update the registry too if it owns the old membership, or seeding restores it.
Changing a user's email invalidates unused login links but leaves existing
sessions active; removing the membership revokes that shelter's access.

## Login

1. `POST /api/auth/request-link` requests a link. It returns 204 for both known
   and unknown addresses; receipt of that response does not prove delivery.
2. The link opens `/portal/prijava`. Tokens expire after 24 hours and work once.
3. `POST /api/auth/verify` exchanges the token for a session cookie.

Send requests with `credentials: "include"`. Before mutations, fetch
`GET /api/auth/csrf` and send its `csrfToken` as `X-CSRFToken`.
Fetch a fresh CSRF token after login.

Default limits: five requests per IP per hour and three emails per recipient
per hour, using a shared file cache. Configure trusted proxy hops for your
network layout; see `.env.example`.

For a local shelter picker, set `PORTAL_DEV_LOGIN=true` and run `seed_shelters`.
This bypasses email authentication and is forced off when `PORTAL_DEBUG=false`.

To check delivery to a mailbox you control:

```bash
uv run python manage.py check_mail --to you@example.com
```

Confirm the message arrives. Mail failures log `portal.mail.delivery_failed`;
recipient throttling logs `portal.mail.address_throttled`.

## Listings and corrections

See `/api/docs` for routes and request schemas. Shelter routes require a session
and membership; mutations also require CSRF. Unknown shelters return 404 and
access to another shelter returns 403.

For crawled animals, `PUT /api/shelters/{slug}/animals/{animal_id}` updates
only supplied fields. `null` clears a correction and restores the crawled value.
Animal IDs must belong to the shelter (`<slug>:<local-id>`).

The editors accept a birth date or an approximate age. Entering one clears
the other. For crawled animals, an age correction also takes precedence over
the crawl's alternative age field in both the API response and published
dataset. Clearing the correction restores the original crawl. If an older
override contains both age fields, the birth date takes precedence.

The portal reads two files from the same ingest run:

- `DATASET_PATH`: `data/dist/animals.json`, the public dataset with corrections.
- `CRAWLED_DATASET_PATH`: `data/dist/animals.crawled.json`, the original crawl
  used to detect source changes since a correction was saved.

Corrections keep winning until explicitly cleared. Review source changes in
`/admin/core/animaloverride/`: accept the crawl for conflicting fields, or keep
the correction and reset its baseline. Ingest records the results in
`data/dist/overrides.json`.

Each animal the routes return also carries `published`: what `DATASET_PATH`
shows for size, energy, the three "good with" answers and `apartmentOk`, which
includes the reviewed enrichment the crawled file lacks. It is display only
and never becomes a correction. The editor shows the shelter's correction
first, then the published value, then the crawl. `published` is `null` for an
animal the file does not hold, or when there is no file.

Providers with `ingestion: manual` use listing routes instead. `POST` creates,
`PUT` replaces the whole listing, and `DELETE` archives it. Photos accept JPEG,
PNG or WebP up to 15 MB; the portal strips metadata and resizes to at most
2048 px. Production must serve persistent `PORTAL_MEDIA_ROOT` at `/media/`.
See the [manual listing contract](../../docs/MANUAL-LISTINGS.md).

## Ingest exports

`GET /api/export` returns corrections; `GET /api/export/listings` returns manual
listings. Both require `Authorization: Bearer $PORTAL_EXPORT_TOKEN`.
An unset server token returns 503; missing or incorrect credentials return 401.

On ingest, configure `PORTAL_EXPORT_URL` and `PORTAL_EXPORT_TOKEN` together.
For an offline run, use `PORTAL_EXPORT_FIXTURE` instead; it takes precedence
over the URL. Example payloads:

- [Corrections](../ingest/fixtures/portal-export.example.json)
- [Manual listings](../ingest/fixtures/portal-listings.contract.json)

Export shapes are shared contracts: update portal and ingest together.

## Checks

From `apps/portal`:

```bash
uv run pytest
uv run ruff check .
uv run ruff format --check .
```

Tests run offline with fixtures and temporary databases. From the repository
root, `pnpm check` runs all checks and the web build.

## Data and license

Use institutional contact details only. No private individuals' personal data
in the database, fixtures or tests. Follow the
[data policy](../../docs/DATA-POLICY.md).

AGPL-3.0-only.
