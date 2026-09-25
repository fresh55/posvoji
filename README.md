<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/logo-dark.svg">
    <img src="docs/assets/logo.svg" alt="Posvoji.si logo: a dog, a cat and a rabbit under one roof" width="128">
  </picture>
</p>

<h1 align="center">Posvoji.si</h1>

<p align="center">
  An open index of animals waiting for a home in Slovenian shelters.<br>
  <a href="https://posvoji.si/en"><b>posvoji.si</b></a>
</p>

<p align="center">
  <a href="https://github.com/fresh55/posvoji/actions/workflows/ci.yml"><img src="https://github.com/fresh55/posvoji/actions/workflows/ci.yml/badge.svg" alt="CI status"></a>
  <a href="https://scorecard.dev/viewer/?uri=github.com/fresh55/posvoji"><img src="https://api.scorecard.dev/projects/github.com/fresh55/posvoji/badge" alt="OpenSSF Scorecard"></a>
</p>

<p align="center">
  <b><a href="README.sl.md">Slovenščina</a></b> ·
  <a href="CONTRIBUTING.md">Contributing</a> ·
  <a href="docs/ADDING-A-PROVIDER.md">Add a shelter</a> ·
  <a href="docs/DATA-POLICY.md">Data policy</a> ·
  <a href="SECURITY.md">Security</a> ·
  <a href="https://github.com/fresh55/posvoji/issues/new/choose">Report a problem</a>
</p>

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
  exports static files. The public site never queries a database.
- **Private shelter portal:** shelter staff sign in to correct fields, and a
  shelter without a catalogue of its own can list animals directly. The portal
  has its own API and database behind authentication.
- **Offline tests:** parsers run against small fixtures. CI never crawls shelter
  websites.

```text
shelter website ──▶ polite ingest ──▶ animals.json + changes.json ──▶ static site
                          ▲
shelter staff ──▶ private portal API ──▶ field corrections and direct listings
```

## For shelters

Your content stays yours. Photos, written descriptions and your logo appear
only with your explicit permission, and the scope of that permission is
recorded in the repository. A source without permission cannot be switched on.

A shelter can at any time ask to change how it is shown or credited, remove
photos or descriptions, lower the sync frequency, or switch its source off
entirely. Withdrawal requests take priority. Write to
[info@posvoji.si](mailto:info@posvoji.si).

## Data boundaries

Permission is recorded in `providers/<shelter>/policy.yaml` and validated by
CI.

This project never indexes:

- private-owner listings or personal contact details;
- personal data of owners, adopters or applicants;
- microchip numbers;
- Facebook or other platforms.

All crawling uses the SDK's `PoliteClient`. It identifies itself as
`PosvojiBot`, respects `robots.txt`, sends one request at a time to any one
server, waits between requests and backs off on `429` responses. There are no
shortcuts around it.

Read the binding rules in the [data policy](docs/DATA-POLICY.md).

## Quick start

The static index uses **Node.js 24** (see `.node-version`) and **pnpm 10**.
Other supported Node releases are listed in `package.json`. Running the complete
test suite also requires **Python 3.12+** and **uv** for the shelter portal.

```bash
pnpm install --frozen-lockfile
pnpm --filter web dev
```

No external services, live crawling, or API keys are needed for local
development. The portal uses a local SQLite database; its setup is documented
in [`apps/portal/README.md`](apps/portal/README.md).

Before opening a pull request, run the checks CI runs:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm validate:policies
```

Add `pnpm --filter web build` when you change `apps/web`.

## Contributing

Start with [CONTRIBUTING.md](CONTRIBUTING.md). The main contribution surface is
`providers/`: one small, tested adapter per shelter.

To add one, copy `providers/_template`, implement the parser and add minimal
fixtures. The full process is in [Adding a provider](docs/ADDING-A-PROVIDER.md).
A parser may be merged before permission arrives, but it must remain disabled.

PR titles follow [Conventional Commits](docs/COMMIT-CONVENTION.md) because pull
requests are squash-merged.

## Reporting problems

Wrong data, a stale listing or an animal that has already found a home:
[open an issue](https://github.com/fresh55/posvoji/issues/new/choose). Issues
are public, so leave out other people's personal data.

Report vulnerabilities and anything that could expose personal data privately,
as described in [SECURITY.md](SECURITY.md). Adoption questions go to the
animal's shelter.

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
`providers/*` are **MIT** so schemas and adapters can be reused elsewhere. Each
MIT tree carries its own `LICENSE` file.

Shelter photos, descriptions, logos and fixture HTML remain third-party
material. They are not covered by the repository's open-source licenses, and
shelters may change or withdraw permission at any time.

The animal data shown on posvoji.si is not offered under an open license
either. Shelters grant permission for this index only, so any other reuse needs
the shelter's own permission.

`data/shelters.yaml` is based on the public register of animal shelters kept by
the Administration for Food Safety, Veterinary Sector and Plant Protection
(UVHVVR), with later checks against the shelters' own websites.

The code licenses do not cover the Posvoji.si name or logo. A fork may reuse the
code, but it must not present itself as Posvoji.si.
