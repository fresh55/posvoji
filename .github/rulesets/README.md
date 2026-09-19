# Merge policy configuration

These are GitHub REST API ruleset payloads. Committing them does not activate
them. Apply both in repository settings or through the rulesets API, then
verify their enforcement on the default branch.

- `owner-merges.json` restricts updates to repository admins through pull
  requests only. In this personal repository, the owner `@fresh55` is the
  only admin. Reassess that assumption before transferring to an organization.
- `main-quality.json` requires the GitHub Actions `checks` and `pr-title` jobs
  on an up-to-date branch, resolved review conversations and a squash pull
  request. It blocks deletion and force pushes, with no bypass actors,
  including the owner.

Title and body edits rerun only the small `pr-title` workflow. The full CI
workflow runs for code updates and keeps a separate run for every main push.

The two rulesets are separate so permission to merge does not bypass checks.
There is no mandatory second reviewer: a sole maintainer cannot approve their
own pull request. CODEOWNERS still requests the owner's review on contributions.

GitHub Free supports these rulesets for public repositories. Private
repositories require a supporting paid plan. Do not change repository
visibility just to enable them: deleting internal documents from the current
tree does not erase earlier commits, branches or pull requests.
