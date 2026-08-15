<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/logo-dark.svg">
    <img src="docs/assets/logo.svg" alt="" width="120">
  </picture>
</p>

# Posvoji.si

🇸🇮 Slovensko: [README.sl.md](README.sl.md)

An open index of animals waiting for a home in Slovenian shelters.

## The idea

Posvoji.si indexes facts (name, species, sex, rough age, status, shelter) and
links every animal back to the shelter's own listing, which is where adoption
happens. It is not a mirror and does not replace anyone's website.

Photos and written descriptions belong to the people who made them, so they
only appear here if the shelter says yes. That permission lives in the repo as
a file (`providers/<shelter>/policy.yaml`) and CI refuses to enable a provider
without it.

Things we deliberately don't touch:

- private listings ("oddajo lastniki", "privat oddaja"), which contain
  people's phone numbers
- personal data of owners, adopters or applicants
- microchip numbers
- Facebook and other platforms

## How it works

There is no backend. An ingest job runs twice a day, reads the sources it is
allowed to read, and writes a dataset.

```text
ingest (2x/day) ──▶ animals.json + changes.json ──▶ static site on a CDN
```

The site is plain static files. RSS feeds and a "new cats near me" notifier are
the obvious next things to build on top of `changes.json`, and both stay
static.

## Repo layout

| Path | What's in it | License |
|---|---|---|
| `apps/web` | Next.js site, static export, shadcn/ui | AGPL-3.0-only |
| `apps/ingest` | The batch pipeline: validate, crawl, diff, export | AGPL-3.0-only |
| `packages/schema` | Zod models: `Animal`, `ProviderPolicy`, `Dataset`, `ChangeSet` | MIT |
| `packages/provider-sdk` | Provider interface, polite HTTP client, fixture harness | MIT |
| `providers/*` | One adapter per shelter, each with its `policy.yaml` | MIT |
| `data/shelters.yaml` | Slovenian shelter registry (source: UVHVVR) | n/a |
| `docs/` | Data policy, provider guide, commit convention | n/a |

## Getting started

```bash
pnpm install
pnpm test
pnpm --filter web dev
```

Node 22+ and pnpm. No database, no API keys, no services: everything runs
offline from fixtures, including the tests.

Two commands worth knowing:

```bash
pnpm validate:policies    # are all provider policies valid and permitted?
pnpm dataset:export       # build the dataset from enabled providers
```

## Contributing

[CONTRIBUTING.md](CONTRIBUTING.md) covers setup and where to contribute.
Commits follow [Conventional Commits](docs/COMMIT-CONVENTION.md).

## Adding a shelter

Copy `providers/_template`, implement three functions, add fixtures and tests.
The details are in [docs/ADDING-A-PROVIDER.md](docs/ADDING-A-PROVIDER.md), and
the rules that aren't up for debate are in
[docs/DATA-POLICY.md](docs/DATA-POLICY.md).

You can write and merge a parser before a shelter has answered; it stays
switched off until permission is recorded.

All HTTP goes through the SDK's `PoliteClient`, which honours robots.txt, waits
between requests, backs off on 429, and only ever talks to one host at a time.
Please don't route around it.

## Licensing

Split on purpose:

- `packages/*` and `providers/*` are **MIT**. The schema and the adapters are
  the parts worth reusing, including outside Slovenia.
- `apps/*` are **AGPL-3.0-only**, so the site and pipeline stay open even for
  someone running a modified copy as a service.

Shelter content (photos, descriptions, fixture HTML) is third-party material
and **not** covered by either license. The shelters keep every right to their
own work and can ask us to change or remove things whenever they like.
