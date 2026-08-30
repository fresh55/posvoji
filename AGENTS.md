# AGENTS.md

Instructions for coding agents working in this repo. Humans want
[CONTRIBUTING.md](CONTRIBUTING.md).

## What this is

Posvoji.si is an open index of animals waiting for a home in Slovenian
shelters. The static index is a pnpm workspace on Node 22+; the optional
shelter self-service portal is a Django app on Python 3.12 managed with uv.
Everything, including the whole test suite, runs offline from fixtures.

| Path | What's in it |
|---|---|
| `apps/web` | Next.js site, static export, shadcn/ui |
| `apps/ingest` | Batch pipeline: validate, crawl, diff, export |
| `apps/portal` | Django API for shelter logins and listing overrides |
| `packages/schema` | Zod models: `Animal`, `ProviderPolicy`, `Dataset`, `ChangeSet` |
| `packages/provider-sdk` | Provider interface, polite HTTP client, fixture harness |
| `providers/*` | One adapter per shelter, each with its `policy.yaml` |
| `data/shelters.yaml` | Slovenian shelter registry (source: UVHVVR) |

## Commits

**Follow [Conventional Commits
v1.0.0-beta.2](https://www.conventionalcommits.org/en/v1.0.0-beta.2/#summary)
for every commit you write.**

```text
<type>[optional scope]: <description>

[optional body]

[optional footer]
```

- Types: `feat`, `fix`, `docs`, `refactor`, `perf`, `test`, `style`, `chore`.
- Scope is the workspace or shelter slug: `web`, `ingest`, `schema`,
  `provider-sdk`, `providers/<shelter-slug>`, `data`, `docs`, `ci`.
- `BREAKING CHANGE:` starts the body or footer when you change the schema, the
  policy shape or the provider interface.
- PRs are squash-merged, so the **PR title must be a valid conventional commit
  too**. It is what lands on `main`.

Full rules and examples: [docs/COMMIT-CONVENTION.md](docs/COMMIT-CONVENTION.md).

## Before you say you're done

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm validate:policies
```

All four must pass. `pnpm test` and `pnpm lint` include the portal checks and
therefore require Python 3.12 and uv. Run `pnpm --filter web build` if you
touched `apps/web`. `pnpm check` runs the complete sequence, including that
build.

## Rules that are not yours to relax

These come from [docs/DATA-POLICY.md](docs/DATA-POLICY.md) and are legal
constraints, not preferences. If a task seems to require breaking one, stop and
say so instead of finding a way around it.

1. **No scraping Facebook or other platforms.** Shelter websites only.
2. **No private-owner listings** ("oddajo lastniki", "privat oddaja"), which
   contain people's phone numbers.
3. **No personal data of private individuals, ever.** Not in code, not in
   fixtures, not in tests.
4. **No photos or descriptions without recorded permission.** A provider cannot
   be enabled without `permission.status: granted` in its `policy.yaml`, and CI
   enforces it.
5. **All HTTP goes through the SDK's `PoliteClient`.** It honours robots.txt,
   serializes per host, delays, and backs off on 429. Never import an HTTP
   client directly, and never bypass the rate limits.
6. **Fixtures stay minimal.** Trim saved HTML to the markup the parser needs.
   No full page mirrors.

## Working notes

- **Normalize conservatively.** Map only fields the schema knows. When a value
  is unclear, omit it or use `"unknown"`. Never guess. `Animal` rejects unknown
  fields on purpose.
- **Parse functions are pure and exported** (`parseList`, `parseDetail`) so
  tests run offline. Prefer label-based lookups ("Spol", "Starost") over
  positional selectors.
- **The folder name, `providerId` in `policy.yaml` and `id` in `provider.ts`
  must match.** `pnpm validate:policies` checks this.
- **Licensing is split on purpose:** `packages/*` and `providers/*` are MIT,
  `apps/*` are AGPL-3.0-only. Don't move code across that line without saying
  so.
- Adding a shelter? [docs/ADDING-A-PROVIDER.md](docs/ADDING-A-PROVIDER.md) is
  the procedure.
