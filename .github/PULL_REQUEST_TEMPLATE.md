## Kaj spreminja ta PR / What this PR changes



## Checklist

- [ ] The PR title is a [conventional commit](https://github.com/fresh55/posvoji/blob/main/docs/COMMIT-CONVENTION.md) (e.g. `feat(web): ...`) — it becomes the commit on `main`
- [ ] `pnpm typecheck && pnpm test` passes locally
- [ ] New parser logic has fixture tests
- [ ] Fixtures are trimmed to the minimum markup (no full page mirrors, no photos, no personal data)
- [ ] No provider is enabled without granted, dated permission in its `policy.yaml`
