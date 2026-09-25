<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/logo-dark.svg">
    <img src="docs/assets/logo.svg" alt="Posvoji.si logo: a dog, a cat and a rabbit under one roof" width="128">
  </picture>
</p>

<h1 align="center">Posvoji.si</h1>

<p align="center">
  One place to find animals waiting for a home in Slovenian shelters.<br>
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

Slovenian shelters each publish their animals on their own website, in their
own format. Someone looking for a dog, a cat or a rabbit has to know which
shelters exist and check them one by one. Posvoji.si puts those listings in one
place, with the same basic facts for every animal: name, species, sex, rough
age, status and shelter.

Posvoji.si does not handle adoptions. An animal found on a shelter's own
website links back to that listing. A shelter without a website of its own can
publish animals here directly, and then this site is the original listing. In
both cases the adoption happens with the shelter.

> [!IMPORTANT]
> Not every Slovenian shelter is included, and a listing can lag behind the
> shelter's own page. Always confirm with the shelter that an animal is still
> available.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/preview-dark.png">
  <img src="docs/assets/preview.png" alt="The top of the posvoji.si home page in English: the headline, the shelter count, species tabs with counts, and Srečko, the project's cat">
</picture>

## For shelters

Your content stays yours. A shelter's animals appear only after it gives
written, dated permission, and the scope of that permission is recorded in
`providers/<shelter>/policy.yaml`, where CI checks it. A source without
permission cannot be switched on. Photos, written descriptions and the
shelter's logo appear only when the permission covers them.

A shelter can at any time ask to change how it is shown or credited, remove
photos or descriptions, lower the sync frequency, or switch its source off.
Withdrawal requests take priority. Write to
[info@posvoji.si](mailto:info@posvoji.si).

The crawler identifies itself as `PosvojiBot`, respects `robots.txt`, sends one
request at a time to any one server, waits between requests and backs off when
a server asks it to. The project never collects private-owner listings,
personal data of owners, adopters or applicants, microchip numbers, or anything
from Facebook and other platforms. The binding rules are in the
[data policy](docs/DATA-POLICY.md).

## Run it locally

You need **Node.js 24** (see `.node-version`) and **pnpm 10**. Other supported
Node releases are listed in `package.json`.

```bash
git clone https://github.com/fresh55/posvoji.git
cd posvoji
pnpm install --frozen-lockfile
pnpm --filter web dev
```

The site opens at <http://localhost:3000>. A fresh clone has no animal data,
because the dataset is built by crawling shelter websites and is not committed.
The animal grid is empty and the shelter directory still shows. Tests never
crawl; they run against small fixtures.

Before opening a pull request, run the checks CI runs. `pnpm test` also covers
the shelter portal, so it needs **Python 3.12+** and **uv**; the portal setup
is in [`apps/portal/README.md`](apps/portal/README.md).

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm validate:policies
```

Add `pnpm --filter web build` when you change `apps/web`.

## Contributing

Useful contributions include:

- fixing a parser when a shelter changes its website;
- adding an adapter for a shelter that is not covered yet;
- improving the Slovenian or English wording on the site;
- reporting a wrong or outdated listing.

An adapter can be written and merged before the shelter's permission arrives.
It stays disabled until then. Start from `providers/_template` and follow
[Adding a provider](docs/ADDING-A-PROVIDER.md).

The project is maintained by [@fresh55](https://github.com/fresh55), who
reviews and merges pull requests. Read [CONTRIBUTING.md](CONTRIBUTING.md)
first. PR titles follow [Conventional Commits](docs/COMMIT-CONVENTION.md)
because pull requests are squash-merged.

## How it works

```text
shelter website ──▶ polite ingest ──▶ animals.json + changes.json ──▶ static site
                          ▲
shelter staff ──▶ private portal API ──▶ field corrections and direct listings
```

The ingest pipeline crawls each enabled shelter, validates the result against
the schema and writes JSON. The web app turns that JSON into a static site that
never queries a database. Shelter staff sign in to a separate portal, with its
own API and database, to correct fields or list animals directly.

| Path | Purpose | License |
| --- | --- | --- |
| `apps/web` | Next.js static site | AGPL-3.0-only |
| `apps/ingest` | Validate, crawl, diff and export | AGPL-3.0-only |
| `apps/portal` | Django shelter self-service API | AGPL-3.0-only |
| `packages/schema` | Zod data models | MIT |
| `packages/provider-sdk` | Provider interface, polite client and fixture tools | MIT |
| `providers/*` | Shelter adapters and machine-readable policies | MIT |
| `data/shelters.yaml` | Slovenian shelter registry sourced from UVHVVR | Not applicable |

## Reporting problems

Wrong data, a stale listing or an animal that has already found a home:
[open an issue](https://github.com/fresh55/posvoji/issues/new/choose). Issues
are public, so leave out other people's personal data.

Report vulnerabilities and anything that could expose personal data privately,
as described in [SECURITY.md](SECURITY.md). Adoption questions go to the
animal's shelter.

## License

The code is open source. `apps/*` is **AGPL-3.0-only**; `packages/*` and
`providers/*` are **MIT** so schemas and adapters can be reused elsewhere. Each
MIT tree carries its own `LICENSE` file.

Shelter content is not. Photos, descriptions, logos and fixture HTML remain the
shelters' material, and the animal data shown on posvoji.si is not offered
under an open license either. Shelters grant permission for this index only,
so any other reuse needs the shelter's own permission, which it may change or
withdraw at any time.

`data/shelters.yaml` is based on the public register of animal shelters kept by
the Administration for Food Safety, Veterinary Sector and Plant Protection
(UVHVVR), with later checks against the shelters' own websites.

The code licenses do not cover the Posvoji.si name or logo. A fork may reuse the
code, but it must not present itself as Posvoji.si.
