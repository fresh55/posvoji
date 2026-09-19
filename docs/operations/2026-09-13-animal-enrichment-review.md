# Animal enrichment review — 13 September 2026

The review covered 50 initial batches using three GPT-5.6 Luna workers,
followed by cross-review and a lead review of proposed values. It covered 509
distinct listing IDs: the 486 saved listings and 23 new listings found during
the source refresh. This is coverage of the enabled shelter catalogue, not a
claim to cover animals outside those sources.

All 484 current listings across 11 providers were checked through the provider
SDK with no failed requests: 359 cats, 121 dogs and four other animals. Two
changed descriptions were reviewed again. Eighteen listings without descriptions
had no usable description text on their source pages; their missing traits
remain unknown.

The committed manifest adds 51 missing facts to 45 current animals:

| Field | Added facts |
| --- | ---: |
| Cat compatibility | 17 |
| Energy | 18 |
| Special needs | 2 |
| Ongoing care | 3 |
| FeLV result | 2 |
| Indoor-only placement | 2 |
| Required joint adoption | 4 |
| Child compatibility | 3 |

A further 122 distinct candidate fields across 85 animals are excluded by the
current allowed-field permissions of six shelters. Their policies were not
expanded. Ambiguous, conditional and outdated statements were also rejected.
No values were invented to produce examples for empty filters.

The local private review artifacts are under `outputs/enrichment-review/`.
They include individual reviews, source-refresh results, rejected candidates
and the enriched preview. They are not public datasets and must not replace the
production host's authoritative input state.

The production integration and release procedure are documented in
[ANIMAL-ENRICHMENT.md](../ANIMAL-ENRICHMENT.md). These counts describe the checked
snapshot. A later export may apply fewer facts when shelter descriptions,
permissions, existing fields or portal corrections change.
