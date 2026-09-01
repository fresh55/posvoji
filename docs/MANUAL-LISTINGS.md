# Manual listings

Some shelters publish no animal list we can crawl. Zavetišče JoHanca has no
website of its own; Zavetišče Oskar has one with no catalogue. For these the
portal is not a place to correct a crawled record, it is the place the record
is written. This document is the contract between the three workspaces that
carry such a listing from the portal to the public site.

## Principle

A manual listing is a crawled animal whose crawler is the portal.

The ingest pipeline has one origin for animal records: the crawl phase. Manual
listings enter at that same point, as if a provider had returned them, so that
every mechanism downstream sees them as ordinary animals: `carryFirstSeenAt`,
`guardUniqueAnimalIds`, `guardMassRemoval`, `applyAllowedFields`, the image
cache, the width ladder, `changes.json` and carry-forward. Nothing is injected
after the override merge and the override tables are not involved.

A shelter is manual when its `providers/<id>/policy.yaml` says
`ingestion: manual`. Such a provider has no adapter in `registry.ts` and the
crawl loop skips it. Only manual shelters may create listings; a crawled
shelter creating one would duplicate the animal on the next crawl.

## Permission

A shelter typing a listing into our portal is publishing it. That is a
stronger grant than a crawl permission, so a manual provider carries
`permission.status: granted`, `images: cache-permitted` and
`descriptions: full-permitted`, dated to the project owner's confirmation.

`docs/DATA-POLICY.md` principle 3 asks for a link to the original listing.
For a manual listing the original is the listing on Posvoji.si itself, so
`source.sourceUrl` is the shelter's public page on the site. The policy
carries a paragraph saying so.

## Identity

The portal mints each listing a UUID4 and never reuses it. Ingest builds the
animal id as `<providerId>:<uuid>` and records the UUID as `sourceAnimalId`.
Manual shelters have no crawled animals, so the two namespaces cannot meet.

## Export contract

`GET /api/export/listings`, authenticated with the same export token as
`/api/export`. The fixture at `apps/ingest/fixtures/portal-listings.contract.json`
is the authoritative shape: the portal's contract test asserts its field set
against the fixture, and the ingest's zod schema parses the fixture's
`export` block. Change one side only together with the other.

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
      "approximateAgeMonths": 8,
      "size": "small",
      "energy": "lively",
      "goodWithKids": "yes",
      "goodWithDogs": "unknown",
      "goodWithCats": "yes",
      "apartmentOk": "yes",
      "specialNeeds": false,
      "shortDescription": "Radovedna in prijazna.",
      "photos": [
        {
          "url": "https://api.posvoji.si/media/listings/6d1c0f6a-3c0e-4a7e-9f7b-2f4a9d1e8b10/3f2a9c.jpg",
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

Rules:

- `providerId`, `id`, `species`, `status`, `name`, `photos`, `createdAt` and
  `updatedAt` are always present.
- Every other field is present when set and absent when not. Never `null`.
  This maps one to one onto the `Animal` schema's optional fields.
- `species` is one of `dog`, `cat`, `rabbit`, `other`. `status` is one of
  `available`, `reserved`, `adopted`, `hold`. The remaining enums are the
  same as the override export.
- `photos` is ordered for display. Each `url` is absolute. `width` and
  `height` are the stored copy's pixel size.
- Archived listings are not exported. Timestamps are UTC ISO 8601 with a `Z`.

## Ingest record

For each exported listing whose provider is enabled and manual:

| Animal field | Value |
| --- | --- |
| `id` | `<providerId>:<id>` |
| `source.providerId` | `providerId` |
| `source.sourceAnimalId` | `id` |
| `source.sourceUrl` | `https://posvoji.si/zavetisca/<providerId>` |
| `source.fetchedAt`, `lastSeenAt` | the run's timestamp |
| `source.firstSeenAt` | `createdAt`, then carried by `carryFirstSeenAt` |
| `shelter` | `id`, `name`, `city` from `data/shelters.yaml` |
| `species`, `status`, and the optional fields | as exported |
| `goodWith` | `{ kids, dogs, cats }` from the three flat fields |
| `images[]` | `{ sourceUrl: photo.url, rights: "cache-permitted" }` |
| `attribution` | `policy.attribution` |

A listing whose provider is not enabled, not manual, or unknown is skipped
and reported, never written.

## Portal API

All listing routes require membership of the shelter and a manual shelter.
A crawled shelter gets 404 on every one of them.

| Route | Body | Answer |
| --- | --- | --- |
| `GET /api/shelters/{slug}/listings` | | `ListingOut[]`, non-archived, by name |
| `POST /api/shelters/{slug}/listings` | `ListingIn` | `ListingOut`, 201 |
| `PUT /api/shelters/{slug}/listings/{id}` | `ListingIn`, full replace | `ListingOut` |
| `DELETE /api/shelters/{slug}/listings/{id}` | | 204, sets `archivedAt` |
| `POST /api/shelters/{slug}/listings/{id}/photos` | multipart `file` | `PhotoOut`, 201 |
| `DELETE /api/shelters/{slug}/listings/{id}/photos/{photoId}` | | 204 |
| `GET /api/export/listings` | export token | see above |

`ListingIn` requires `species` and `name`; `status` defaults to `available`.
Text limits match `AnimalOverrideIn`. `ListingOut` is the export shape plus
`archivedAt`, with each photo carrying its `id`.

`GET /api/me` reports `ingestion` on every shelter so the workspace knows
which editor to open.

## Photos

Uploads accept JPEG, PNG and WebP up to 15 MB. The portal re-encodes every
file, which strips EXIF and with it the GPS position of the phone that took
it, caps the longest side at 2048 px, records the resulting size, and stores
the file under a content hash at `listings/<listing id>/<hash>.jpg`. Ingest
then fetches it like any other remote photo and builds the width ladder
itself. Django serves `MEDIA_URL` in development; production serves it from
nginx on `api.posvoji.si`.

## Lifecycle

Status carries the ordinary states. Archiving is the shelter's delete: the
listing leaves the export, and the next run removes the animal through the
same path a crawled animal leaves by. `guardMassRemoval` still applies, which
is what it is for.

## Latency

The public site is a static export on a twelve hour cycle. For a crawled
shelter that is fine, its own site is live at once. For a manual shelter
Posvoji.si is the only listing, so the workspace says how long a change takes
to show. Triggering an ingest-only run on portal changes is the follow-up.

## Web

Manual shelters get a different editor from crawled ones. There is no crawled
baseline, so no override marks, no revert, no "empty means your site's value".
Create and edit are one form that sends the whole listing. The crawled editor
is untouched.
