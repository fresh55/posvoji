# CLAUDE.md

Guidance for Claude Code when working in this repo.

Read [AGENTS.md](AGENTS.md) first. It holds the repo layout, the verification
commands and the data rules that are not negotiable, and all of it applies
here. This file only restates what is easiest to get wrong.

## Commit messages

**Every commit follows [Conventional Commits
v1.0.0-beta.2](https://www.conventionalcommits.org/en/v1.0.0-beta.2/#summary).**
No exceptions, including for one-line fixes and doc tweaks.

```text
<type>[optional scope]: <description>

[optional body]

[optional footer]
```

- **Types:** `feat`, `fix`, `docs`, `refactor`, `perf`, `test`, `style`,
  `chore`. `feat` is a new capability, `fix` is a bug fix. If you are unsure
  between the two, it is a `fix`.
- **Scope:** the workspace or shelter slug: `web`, `ingest`, `schema`,
  `provider-sdk`, `providers/<shelter-slug>`, `data`, `docs`, `ci`. Optional by
  the spec, expected here.
- **Description:** imperative, lowercase, no trailing period. Slovenian or
  English both fine; the type and scope are always English.
- **Breaking changes:** `BREAKING CHANGE:` at the start of the body or footer,
  with a description of what broke. Applies to the `Animal` schema, the
  `ProviderPolicy` shape and the `AdoptionProvider` interface.
- **Footers** carry breaking changes, issue references and links, nothing else.

```text
feat(providers/ljubljana): parse the rabbit listings

Closes #42
```

PRs are squash-merged, so **the PR title must be a valid conventional commit on
its own**. It becomes the commit message on `main`.

Full rules and examples: [docs/COMMIT-CONVENTION.md](docs/COMMIT-CONVENTION.md).

## Writing style

Documentation and comments in this repo stay plain. No em dashes, no filler,
no jokes. Write the necessary and the important, then stop.

## Before reporting a change as done

```bash
pnpm typecheck
pnpm test
pnpm validate:policies
```

Plus `pnpm --filter web build` if `apps/web` changed. Report what actually ran
and what it said. Don't call a change verified on the strength of it looking
right.

## Things to stop and ask about

- Anything that would touch personal data, private-owner listings, or a
  shelter's photos and descriptions without granted permission in
  `policy.yaml`.
- Bypassing `PoliteClient` or its rate limits for any reason.
- Changes in `packages/`. The schema and SDK affect everything downstream, so
  CONTRIBUTING.md asks for an issue first.
- Moving code between `packages/*` and `providers/*` (MIT) and `apps/*`
  (AGPL-3.0-only).
