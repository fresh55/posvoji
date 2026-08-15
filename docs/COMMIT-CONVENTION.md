# Commit convention

This repo follows [Conventional Commits
v1.0.0-beta.2](https://www.conventionalcommits.org/en/v1.0.0-beta.2/#summary).
Every commit message and every pull request title must match it.

## Structure

```text
<type>[optional scope]: <description>

[optional body]

[optional footer]
```

The type is a noun, followed by a colon and a space. The description follows
immediately and says what the commit does, in the imperative — "add the rabbit
filter", not "added" or "adds".

## Types

`feat` and `fix` are the two the spec defines; the rest are the ones we
actually use here.

| Type | When |
|---|---|
| `feat` | A new capability — a provider, a filter, a page. |
| `fix` | A bug fix. |
| `docs` | Documentation only, including this file. |
| `refactor` | Restructuring with no behaviour change. |
| `perf` | A change made for speed or bundle size. |
| `test` | Tests and fixtures only. |
| `style` | Formatting, whitespace, lint — no logic. |
| `chore` | Tooling, dependencies, CI, release plumbing. |

## Scopes

The scope is optional but strongly preferred in a monorepo — it is usually the
workspace or the shelter slug:

`web`, `ingest`, `schema`, `provider-sdk`, `providers/<shelter-slug>`, `data`,
`docs`, `ci`

```text
feat(providers/ljubljana): parse the rabbit listings
fix(web): keep the species tabs pinned on mobile
chore(ci): bump actions/checkout to v7
```

## Breaking changes

`BREAKING CHANGE:` goes at the start of the body or the footer, followed by a
description of what broke and what to do about it. In this repo that mostly
means the `Animal` schema, the `ProviderPolicy` shape, or the
`AdoptionProvider` interface — anything a provider outside this repo could be
depending on.

```text
feat(schema): require a shelter reference on every animal

BREAKING CHANGE: Animal.shelterId is no longer optional. Providers that
omitted it now fail validation; set it from the provider id.
```

## Footers

Footers carry breaking changes, issue references and links — nothing else.

```text
fix(ingest): stop retrying on 410

Closes #42
```

## Language

The type, the scope and any `BREAKING CHANGE:` token are always English —
tooling reads them. The description and body can be Slovenian or English,
whichever you think in.

```text
feat(web): dodaj filter za starost
```

## Pull requests

PRs are squash-merged, so the **PR title becomes the commit message on `main`**
and has to be a valid conventional commit on its own. The individual commits on
your branch should follow the convention too, but the title is the one that
lasts.

## Examples from this repo

Real commits, rewritten the way they should have been:

```text
feat(web): add app icons built from the logo mark
fix(docs): stop the heading rule from cutting through the readme logo
refactor(web): collapse the sidebar filters to two control shapes
chore(ci): bump the pinned action versions
```

## Anti-patterns

- `update stuff` — no type, and no information either.
- `feat: fix the age parser` — that's a `fix`.
- `feat(web): add filters, bump deps, and fix the map` — three commits wearing
  a trenchcoat. Keep PRs focused; the convention only works if a commit does
  one thing.
- `Feat(Web): Add Filters` — lowercase the type and scope.
- `fix(web): filter bug.` — no trailing period.
