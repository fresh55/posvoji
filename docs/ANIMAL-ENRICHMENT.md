# Reviewed animal enrichment

The production export fills missing filter fields from individually reviewed
shelter descriptions. It does not classify text at runtime or invent values to
populate filters. `data/animal-enrichment.json` is the versioned input.

## Evidence and review

Each record names the provider, animal, original listing URL and SHA-256 of the
complete description. Each claim holds a typed field/value, two distinct
reviewers and a UTF-16 character span with its own SHA-256. Offsets use JavaScript
`String.slice(start, end)`, and hashes use the resulting UTF-8 bytes. Exact source
wording is recoverable from the private crawled dataset; it is not copied into
the repository. Shelter prose and photographs retain their separate rights.

Review complete descriptions, including negatives, qualifications, other animals
and past events. Keep unclear or conditional answers absent. In particular:

- Indoor-only placement does not establish apartment suitability.
- A friendly or playful animal is not automatically child-compatible or lively.
- Compatibility with older children does not answer compatibility with all children.
- Preferred joint adoption and arriving with a sibling do not establish required
  adoption together.
- A resolved injury does not establish current ongoing care. Report treatment
  requirements only when the description states them for the current animal.
- Existing `unknown`, `no` and `false` values are answers and are never filled over.

The added optional `Animal.adoptionRequirements` object distinguishes
`indoorOnly`, `bondedPair`, `experiencedCarer` and `ongoingCare` from energy,
apartment suitability and the existing patience/special-needs field. These
requirements mean explicit current placement or care requirements, not a
probability or a general recommendation for every animal. Consumers must accept
this expanded strict schema before consuming an enriched dataset.

## Publication and precedence

1. Apply current publication permission, excluded paths and allowed-field policy.
2. Capture `animals.crawled.json` before enrichment or portal corrections.
3. Match reviewed claims to that raw snapshot. Fill only missing fields, only
   when source URL, description hash and evidence span still match.
4. Apply shelter portal corrections. A correction to a field suppresses its
   enrichment; a changed description suppresses all claims reviewed against the
   old description. Medical FIV/FeLV additions apply only to cats.
5. Cache media, validate and publish using the existing export transaction.

The manifest is loaded and validated once per export. A malformed or missing
manifest stops the export. A removed animal never gets recreated. Revoked
permission or a changed description prevents the addition from shipping.
Every run starts with the raw snapshot, so stale values cannot survive through
incremental carry-over. No source observation timestamp is advanced by review.

`overrides.json.enrichment` records applied fields and skipped claims; reasons
include changed evidence, source changes, permission, an existing answer and a
shelter correction. `crawl-manifest.json.enrichmentRevision` binds the reviewed
input to the existing sealed generation. These reports are operational/private
artifacts, not additional public datasets.

Source changes create a review queue in that report. Re-review the new complete
description with a second reviewer and update the manifest before the value
returns. This does not automatically run an LLM or create a background job.
For newly introduced requirements, a shelter can correct its published
description through the existing portal; direct requirement editing is not yet
part of the portal form.

## Verification and release

Run `pnpm check` before release. Enrichment tests cover stale evidence, permission,
existing answers, species constraints, raw snapshot separation and portal
precedence. Filter tests cover explicit true versus absent/false, real counts,
shared URL filters and zero-result controls that remain removable.

The public filters show all applicable options with their real counts. A zero
means no confirmed matching records, not proof that no animal has that property.
Species-specific rules remain: feline tests apply to cats, and cat size does not
become an available filter just to fill the panel.

Use the normal committed-code production promotion procedure in
[PRODUCTION-OPERATIONS.md](PRODUCTION-OPERATIONS.md). The production host should
export from its own current input authority after promotion; do not replace it
with a local snapshot or reset its generation sequence. `--republish` applies
the current manifest to saved source data without implying a fresh source check.
