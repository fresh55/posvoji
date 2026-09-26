# Reviewed animal enrichment

The production export fills missing profile fields from individually reviewed
shelter descriptions and applies explicitly reviewed corrections. It does not classify text at runtime or invent values to
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
- "Not for a family with small children" is `adoptionRequirements.noYoungKids`,
  not `goodWith.kids: no`. The children answer stays absent beside it.
- Preferred joint adoption and arriving with a sibling do not establish required
  adoption together.
- A resolved injury does not establish current ongoing care. Report treatment
  requirements only when the description states them for the current animal.
- Existing `unknown`, `no` and `false` values are answers. Changing one requires
  an explicit `replaces` baseline and a second review of the new evidence.

The added optional `Animal.adoptionRequirements` object distinguishes
`indoorOnly`, `bondedPair`, `experiencedCarer`, `ongoingCare`, `onlyPet` and
`noYoungKids` from energy, apartment suitability, the household answers in
`goodWith` and the existing patience/special-needs field. These
requirements mean explicit current placement or care requirements, not a
probability or a general recommendation for every animal. Consumers must accept
this expanded strict schema before consuming an enriched dataset.

## Publication and precedence

1. Apply current publication permission, excluded paths and allowed-field policy.
2. Capture `animals.crawled.json` before enrichment or portal corrections.
3. Match reviewed claims to that raw snapshot. Fill missing fields only when
   source URL, description hash and evidence span still match. A claim with
   `replaces` changes a field only if its current value exactly matches that
   reviewed baseline. Names, species, breed, dates, age and finding location use
   the same public schema validators as the original structured data.
4. Apply shelter portal corrections. A correction to a field suppresses its
   enrichment; a changed description suppresses all claims reviewed against the
   old description. Medical FIV/FeLV additions apply only to cats. Correcting a
   misclassified cat to another species clears inherited feline test results;
   the applied-field report marks these removals with `operation: "clear"`.
5. Cache media, validate and publish using the existing export transaction.

The manifest is loaded and validated once per export. A malformed or missing
manifest stops the export. A removed animal never gets recreated. Revoked
permission or a changed description prevents the addition from shipping.
Every run starts with the raw snapshot, so stale values cannot survive through
incremental carry-over. No source observation timestamp is advanced by review.

`data/animal-profile-reviews.json` records the complete profile review for every
animal in the reviewed snapshot, including fields that remain unknown. It is an
audit record, not an instruction to populate unknown values or impersonate
shelter staff. Its known/unknown field lists reflect the resulting permitted
dataset. The enrichment manifest remains the only publication input.

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

## Life stage

`lifeStage` (young, adult, senior: the site's Mladiček, Odrasel and Senior)
records a stage the shelter states where it gives no age a number can carry.
It comes from a claim here with text evidence ("odrasel", "senior", a kitten
from a litter taken in with its mother), from a provider parser reading a
range that stays inside one stage ("8–10 let"), or from a photo review in
`data/animal-appearance.json`. A photo review may only record young, under
its own two reviewers: a photo cannot tell five years from nine, and it can be
as old as the listing.

A claim needs the whole possible range of the animal's current age inside the
stage. Text is dated no earlier than the intake, so "7 let" on a listing from
2020 could now be 13 and is left unknown.

A stated age or birth date always wins. The export drops a young stage six
months after the earlier of the intake and finding dates, and at once when
the animal has neither, because a listing keeps calling an animal a kitten
long after it has grown.

## Time in the shelter

V zavetišču reads the intake date. Where a listing has none, it reads the
found date, since a found animal is brought in that day: Zonzani numbers dogs
and cats in one register, and its dogs' found dates fall between its cats'
intake dates in that order. Where there is neither, it reads `intakeBy`.

`intakeBy` is the last day of the month, season or year the shelter names for
the arrival ("od maja 2025" is 2025-05-31, "pozimi 2022" is 2023-02-28, "v
letu 2019" is 2019-12-31), and never later than the day the page was read. A
wait read from it is a floor, so the dialog and the card say "vsaj", and a
threshold is passed only once the latest possible arrival has passed it.
"Najnovejši sprejemi" leaves it out, since it would rank an old animal as new.
The Mačji dol parser sets it; it is not a claim field. The period has to be
the only one in a clause with an arrival word, and a sentence that also dates
a birth, a life elsewhere or an adoption gives none.

Not used: a post's publish date, because sites reuse old posts for new animals
(Mačji dol's Vinko and Oniks share one), a date from a text about a returned
animal, which belongs to the earlier stay, and `firstSeenAt`, which is when
this site found the listing.

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
