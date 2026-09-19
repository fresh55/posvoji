## Kaj spreminja ta PR / What this PR changes



## Validation / Preverjanje

Describe the checks you ran and their results. Link a related issue if there is one.

## Checklist

- [ ] The PR title is a [conventional commit](https://github.com/fresh55/posvoji/blob/main/docs/COMMIT-CONVENTION.md) (e.g. `feat(web): ...`), since it becomes the commit on `main`
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test` and `pnpm validate:policies` pass locally
- [ ] `pnpm --filter web build` passes if `apps/web` changed
- [ ] New parser logic has fixture tests
- [ ] Fixtures are trimmed to the minimum markup (no full page mirrors, no photos, no personal data)
- [ ] No provider is enabled without granted, dated permission in its `policy.yaml`
- [ ] No internal audits, deployment notes, credentials or private correspondence are included
