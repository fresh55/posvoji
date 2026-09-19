# Contributing

Hvala! Contributions are welcome in Slovenian or English.

## First contribution

Start with an issue labelled **good first issue** or **help wanted**, or use an
[issue form](https://github.com/fresh55/posvoji/issues/new/choose) to report a bug,
propose a shelter or discuss an improvement. Small fixes can go straight to a
pull request; discuss larger changes first so the scope is clear.

Fork the repository, create a branch in your fork, and open a pull request to
`main`. You do not need write access to contribute. Draft pull requests are
welcome when you want early feedback. Please follow the
[Code of Conduct](CODE_OF_CONDUCT.md).

`@fresh55` is the sole maintainer and the only person who merges pull requests.
CODEOWNERS requests their review. The merge policy is a squash commit after
checks pass and review conversations are resolved; bots do not merge changes.

## Setup

```bash
pnpm install --frozen-lockfile
uv sync --directory apps/portal --frozen
pnpm typecheck
pnpm lint
pnpm test
pnpm validate:policies
```

Node 24 (see `.node-version`), pnpm, Python >= 3.12 and uv are required for the
complete check suite. No external services are needed; the whole project works offline from
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
   `permission.status: granted` from the shelter, and CI enforces this. Parsers
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
- `pnpm typecheck`, `pnpm lint`, `pnpm test` and `pnpm validate:policies` must pass.
- Run `pnpm --filter web build` when changing `apps/web`.
- New parser logic needs fixture tests.

## Labels and review

Use the issue forms to select a report type. The maintainer adds area labels
and removes `status: triage` after the first review. `good first issue` means
the task is small and has enough guidance to get started; `help wanted` means
the proposed work is ready for contributions. A label is not a promise of a
release date. Explain a blocker before adding `status: blocked`.

## Public documentation and private reports

Keep setup instructions, API contracts, deployment runbooks, data policy and
permission records versioned with the code. Use portable example paths rather
than a particular contributor's home directory. Keep credentials and private
correspondence out of Git. If a document needs restricted access, maintain it
in a separate private repository with a clear reference from the relevant
code. Ignoring or deleting a file does not remove it from earlier Git history.

Do not post credentials or personal data in issues, commits or screenshots.
Follow [SECURITY.md](SECURITY.md) for vulnerabilities and other private reports.

`pnpm lint` checks provider fixtures for email addresses and phone numbers.
Use reserved example domains for synthetic email addresses. Any necessary
institutional contact or synthetic phone example needs an exact fixture entry
and a reason in `scripts/fixture-contact-allowlist.json`. This check supplements
human review; it does not detect every kind of personal information.

New dependency versions wait seven days before routine installation or a
Dependabot version-update PR. Dependabot security updates bypass its cooldown.
For an urgent pnpm security update, review the upstream release and use a
temporary command-line `--config.minimumReleaseAge=0` override for that update;
do not lower the repository-wide setting or broaden lifecycle-script approval.
