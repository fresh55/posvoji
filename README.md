<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/logo-dark.svg">
    <img src="docs/assets/logo.svg" alt="Posvoji.si logo" width="120">
  </picture>
</p>

# Posvoji.si

An open index of animals waiting for a home in Slovenian shelters.

[![CI](https://github.com/fresh55/posvoji/actions/workflows/ci.yml/badge.svg)](https://github.com/fresh55/posvoji/actions/workflows/ci.yml)

**[Slovenščina](README.sl.md)** · [Contributing](CONTRIBUTING.md) ·
[Add a shelter](docs/ADDING-A-PROVIDER.md) · [Data policy](docs/DATA-POLICY.md) ·
[Report a problem](../../issues/new/choose)

> [!NOTE]
> Posvoji.si does not handle adoptions. Every animal links to the shelter's
> original listing, where the adoption process takes place.

## What it does

Posvoji.si brings basic facts from participating shelters into one searchable
index: name, species, sex, rough age, status and shelter. Every record keeps its
source and last-sync time.

- **Permission first:** a source stays disabled until the shelter grants
  written, dated permission.
- **Source over copy:** the index points people back to the shelter instead of
  replacing its website.
- **Static public index:** the ingest pipeline writes JSON and the web app
  exports static files. The separate shelter portal has a private API and
  database for authenticated corrections; the public site does not query it.
- **Offline tests:** parsers run against small fixtures. CI never crawls shelter
  websites.

```text
shelter website ──▶ polite ingest ──▶ animals.json + changes.json ──▶ static site
                          ▲
shelter staff ──▶ private portal API ──▶ reviewed field overrides
```

## Data boundaries

Permission is recorded in `providers/<shelter>/policy.yaml` and validated by
CI. Photos and written descriptions appear only when the shelter explicitly
allows them.

This project never indexes:

- private-owner listings or personal contact details;
- personal data of owners, adopters or applicants;
- microchip numbers;
- Facebook or other platforms.

All crawling uses the SDK's `PoliteClient`: it respects `robots.txt`, serializes
requests per host, waits between requests and backs off on `429` responses.
There are no shortcuts around it.

Read the binding rules in the [data policy](docs/DATA-POLICY.md).

## Quick start

The static index requires **Node.js 22+** and **pnpm 10**. Running the complete
test suite also requires **Python 3.12+** and **uv** for the shelter portal.

```bash
pnpm install
pnpm test
pnpm --filter web dev
```

No external services, live crawling, or API keys are needed for local
development. The portal uses a local SQLite database; its setup is documented
in [`apps/portal/README.md`](apps/portal/README.md).

## Contributing

Start with [CONTRIBUTING.md](CONTRIBUTING.md). The main contribution surface is
`providers/`: one small, tested adapter per shelter.

To add one, copy `providers/_template`, implement the parser and add minimal
fixtures. The full process is in [Adding a provider](docs/ADDING-A-PROVIDER.md).
A parser may be merged before permission arrives, but it must remain disabled.

PR titles follow [Conventional Commits](docs/COMMIT-CONVENTION.md) because pull
requests are squash-merged.

## Repository map

| Path | Purpose | License |
| --- | --- | --- |
| `apps/web` | Next.js static site | AGPL-3.0-only |
| `apps/ingest` | Validate, crawl, diff and export | AGPL-3.0-only |
| `apps/portal` | Django shelter self-service API | AGPL-3.0-only |
| `packages/schema` | Zod data models | MIT |
| `packages/provider-sdk` | Provider interface, polite client and fixture tools | MIT |
| `providers/*` | Shelter adapters and machine-readable policies | MIT |
| `data/shelters.yaml` | Slovenian shelter registry sourced from UVHVVR | Not applicable |

## License

The split is intentional: `apps/*` is **AGPL-3.0-only**; `packages/*` and
`providers/*` are **MIT** so schemas and adapters can be reused elsewhere.

Shelter photos, descriptions and fixture HTML remain third-party material.
They are not covered by the repository's open-source licenses, and shelters
may change or withdraw permission at any time.
