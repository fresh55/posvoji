# Production animal review — 19 September 2026

Three GPT-5.6 Luna workers reviewed 100 batches covering all 490 listing IDs in
the production generation from `2026-09-19T15:21:19.405Z`, published with code
`f1747c3e23be7063e9bf4426986e734e3c549acf`. Each listing's full saved description,
raw and published fields, and up to two representative permitted photographs
were reviewed. Source observations retain their individual crawl timestamps.

The review inspected 895 photographs across 488 listings. `mala-hisa:1160` and
`meli:tomi-isce-nov-dom` had no photographs. All 980 generated Slovenian and
English animal pages existed and linked their original source. All 1,769
referenced photos existed in the production media store (1,756 distinct files).
These are file and evidence checks, not a claim of a browser interaction test
on every page or visual inspection of every gallery photograph.

Lead review accepted 108 additional field changes across 88 listings:

| Field | Changes |
| --- | ---: |
| Cat compatibility | 46 |
| Extra time, knowledge or care needed | 15 |
| Energy | 9 |
| Adoption status | 10 |
| Size | 8 |
| Finding locality | 4 |
| Dog compatibility | 3 |
| Breed | 2 |
| FeLV result | 2 |
| Required joint adoption | 2 |
| Child compatibility | 2 |
| Indoor-only placement | 1 |
| Ongoing care | 1 |
| Experienced carer | 1 |
| Completed neutering | 1 |
| Apartment suitability | 1 |

The status corrections resolve three explicit home-seeking descriptions whose
structured status was unknown and place Albert E., Meti and her five kittens
on hold: their descriptions explicitly say they are not yet available. Those seven
corrections apply only while the raw status remains `available`, so they cannot
overwrite a later reserved or adopted status.

Britney's finding locality was re-reviewed after her description changed; the
old locality stays removed and the current Celje evidence is recorded. Her
healed injuries were not treated as ongoing medical care. Historical intake
ages were not substituted for current ages. Photo appearance did not supply
breed, sex, medical or behavioral claims.

The final candidate files contain 175 fields excluded by current shelter
permissions. Permissions were not expanded. Dino's structured large size and
medium size in prose remain an unresolved source discrepancy; the structured
value is retained. Roki (`mala-hisa:1083`) has explicit dog-placement constraints
in prose, but the provider does not permit that structured compatibility field.

## Persistence and verification

The versioned enrichment manifest now has 478 claims; applying it to the
reviewed production snapshot performs 480 operations including the two
existing feline-test removals accompanying species corrections. Nine obsolete
or already-satisfied claims were pruned. New claims have an exact evidence
span, full-description hash, source identity, and independent worker/lead review.
The profile audit covers all 490 IDs and records the inspected image hashes.

Replaying the complete manifest against a serialized fresh raw snapshot with
later crawl timestamps reapplies all 480 operations without mutating raw input.
Regression tests also cover saved carry-over, explicit correction baselines,
fresh crawls, and removal of stale facts after a description changes. Portal
corrections and publication permissions retain their precedence. No values are
written into the raw crawl or into shelter staff accounts.

Validation: `pnpm typecheck`, `pnpm lint`, `pnpm test`,
`pnpm validate:policies`, and `pnpm --filter web build` passed. An initial test
worker exited unexpectedly; the complete test command passed on retry. The
dedicated enrichment suite passed all 15 tests after the data review.

Private evidence and review files remain in
`outputs/production-review-20260919/` in the original workspace. They are not
public datasets and must not replace the production host's authoritative
input state. Publication follows the standard committed-code promotion and
host export procedure.
