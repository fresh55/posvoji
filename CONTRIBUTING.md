# Contributing

Hvala! Contributions are welcome in Slovenian or English.

## Setup

```bash
pnpm install
pnpm typecheck
pnpm test
```

Node >= 22 and pnpm are required. There are no services to run — the whole
project works offline from fixtures.

## Where to contribute

- **`providers/`** — the main contribution surface. One folder per shelter.
- **`apps/web`** — the site (Next.js static export + shadcn/ui).
- **`apps/ingest`** — the batch pipeline.
- **`packages/`** — schema and SDK; changes here affect everything, so open an
  issue first.

## Adding a provider

Read [docs/ADDING-A-PROVIDER.md](docs/ADDING-A-PROVIDER.md) first. The short
version:

1. Copy `providers/_template` to `providers/<shelter-slug>`.
2. Implement `discover()`, `fetch()`, `normalize()` against the SDK interface.
3. Add minimal fixture HTML and tests. Fixtures must be trimmed to the markup
   the parser needs — never commit full page mirrors, photos, or any personal
   data.
4. Fill in `policy.yaml`. A provider **cannot be enabled** without
   `permission_status: granted` from the shelter — CI enforces this. Parsers
   for shelters that haven't answered yet are welcome; they stay disabled.

## Rules that are not negotiable

These come from [docs/DATA-POLICY.md](docs/DATA-POLICY.md):

- No scraping of Facebook or other platforms.
- No private-owner listings ("oddajo lastniki", "privat oddaja").
- No personal data of private individuals, ever.
- No photos or descriptions without recorded permission.
- Crawl politely: the SDK's rate limits and backoff are not to be bypassed.

## Pull requests

- Keep PRs focused; one provider or one feature per PR.
- `pnpm typecheck && pnpm test` must pass.
- New parser logic needs fixture tests.
- English or Slovenian commit messages are both fine.
