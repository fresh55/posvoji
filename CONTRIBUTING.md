# Contributing

Hvala! Contributions are welcome in Slovenian or English.

## Setup

```bash
pnpm install
pnpm typecheck
pnpm lint
pnpm test
```

Node >= 22, pnpm, Python >= 3.12 and uv are required for the complete check
suite. No external services are needed; the whole project works offline from
fixtures. See [`apps/portal/README.md`](apps/portal/README.md) only when you
need to run the shelter portal itself.

### When `next dev` reports an error the build does not

`next dev` can report a recovered server error that `pnpm --filter web build`
and the tests do not reproduce. Two causes have been seen, neither of them in
this repo's code:

- A dev server left running for a long time keeps serving stale compiled
  modules. The error then repeats on every hard load of the affected page and
  goes away on restart.
- A few seconds after startup Next reads its own manifests from
  `apps/web/.next/dev` while Turbopack is still writing them, which surfaces
  once as `SyntaxError: Unexpected end of JSON input`.

Restart the dev server and reproduce before bisecting anything. Dev stack
traces are mapped back through the compiled chunk and can name a function that
never ran, so confirm a frame is real by adding a guard to it before trusting
what it says.

## Where to contribute

- **`providers/`**: the main contribution surface. One folder per shelter.
- **`apps/web`**: the site (Next.js static export + shadcn/ui).
- **`apps/ingest`**: the batch pipeline.
- **`apps/portal`**: authenticated shelter logins and listing overrides.
- **`packages/`**: schema and SDK. Changes here affect everything, so open an
  issue first.

## Adding a provider

Read [docs/ADDING-A-PROVIDER.md](docs/ADDING-A-PROVIDER.md) first. The short
version:

1. Copy `providers/_template` to `providers/<shelter-slug>`.
2. Implement `discover()`, `fetch()`, `normalize()` against the SDK interface.
3. Add minimal fixture HTML and tests. Fixtures must be trimmed to the markup
   the parser needs. Never commit full page mirrors, photos, or any personal
   data.
4. Fill in `policy.yaml`. A provider **cannot be enabled** without
   `permission_status: granted` from the shelter, and CI enforces this. Parsers
   for shelters that haven't answered yet are welcome; they stay disabled.

## Rules that are not negotiable

These come from [docs/DATA-POLICY.md](docs/DATA-POLICY.md):

- No scraping of Facebook or other platforms.
- No private-owner listings ("oddajo lastniki", "privat oddaja").
- No personal data of private individuals, ever.
- No photos or descriptions without recorded permission.
- Crawl politely: the SDK's rate limits and backoff are not to be bypassed.

## Commit messages

We follow [Conventional Commits
v1.0.0-beta.2](https://www.conventionalcommits.org/en/v1.0.0-beta.2/#summary):

```text
<type>[optional scope]: <description>
```

```text
feat(providers/ljubljana): parse the rabbit listings
fix(web): keep the species tabs pinned on mobile
docs: explain the permission workflow
```

Types are `feat`, `fix`, `docs`, `refactor`, `perf`, `test`, `style` and
`chore`. The scope is the workspace or the shelter slug. Breaking changes to
the schema, the policy shape or the provider interface start the body or footer
with `BREAKING CHANGE:`.

The type and scope are English because tooling reads them; the description can
be Slovenian or English. Details and examples are in
[docs/COMMIT-CONVENTION.md](docs/COMMIT-CONVENTION.md).

## Pull requests

- Keep PRs focused; one provider or one feature per PR.
- The **PR title must be a valid conventional commit**. PRs are squash-merged,
  so the title is what lands on `main`.
- `pnpm typecheck && pnpm test` must pass.
- New parser logic needs fixture tests.
