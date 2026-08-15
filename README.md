# Posvoji.si

Odprt indeks živali iz slovenskih zavetišč, ki iščejo dom.

Posvoji.si ni kopija spletnih strani zavetišč. Pri vsaki živali je jasno navedeno
izvorno zavetišče, čas zadnje sinhronizacije in povezava na originalno objavo,
kjer posvojitev tudi poteka. Fotografije in opisi se prikazujejo samo z izrecnim
dovoljenjem zavetišča.

**Status: v pripravi.** Iščemo prva partnerska zavetišča — glej
[docs/DATA-POLICY.md](docs/DATA-POLICY.md).

---

## What this is

An open-source, permission-first index of adoptable animals from Slovenian
shelters. It aggregates *facts* (name, species, sex, age, status), always
attributes the source shelter, and links every animal back to its original
listing. Photos and creative descriptions are shown only with the shelter's
explicit permission.

## What this is not

- Not a mirror of shelter websites.
- Not a marketplace — adoption always happens at the shelter.
- Not a host for private ("oddajo lastniki") listings.
- Not a collector of personal data: no adopter data, no private owners'
  contacts, no microchip numbers.

## How it works

There is no serving backend. An ingest job runs twice a day, reads permitted
sources politely, and produces a static dataset; the site is rebuilt from it.

```text
ingest (2x/day, batch) ──▶ animals.json + changes.json + RSS ──▶ static site on CDN
```

## Repository layout

| Path | Contents | License |
|---|---|---|
| `apps/web` | Next.js site (static export, shadcn/ui) | AGPL-3.0-only |
| `apps/ingest` | Crawl/normalize/export batch CLI | AGPL-3.0-only |
| `packages/schema` | Zod models: `Animal`, `ProviderPolicy`, `ChangeSet` | MIT |
| `packages/provider-sdk` | Provider interface, polite HTTP client, fixture harness | MIT |
| `providers/*` | One adapter per shelter, each with a machine-readable `policy.yaml` | MIT |
| `data/shelters.yaml` | Registry of Slovenian shelters (source: UVHVVR) | — |
| `docs/` | Data policy, provider guide | — |

A provider is only ever enabled when its `policy.yaml` records granted
permission — this is enforced in CI, not by convention. See
[docs/ADDING-A-PROVIDER.md](docs/ADDING-A-PROVIDER.md).

## Getting started

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm --filter web dev        # site on http://localhost:3000
pnpm validate:policies       # check all provider policies
pnpm dataset:export          # build the dataset from enabled providers
```

Requires Node >= 22 and pnpm.

## Licensing

Code is split-licensed on purpose:

- `packages/*` and `providers/*` are **MIT** — the schema and adapters are the
  part we want reused, anywhere, by anyone.
- `apps/*` are **AGPL-3.0-only** — the site and pipeline stay open, including
  for anyone who runs a modified copy as a service.

Shelter content (photos, descriptions, fixture HTML) is **third-party material
and is not covered by either license**. Shelters keep all rights to their
content and can request changes or removal at any time.
