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

## Public launch sequence

Before changing visibility, scan all available branches, tags and pull-request
refs with Gitleaks and TruffleHog. Keep reports private and review every finding.
TruffleHog's `--no-verification` avoids sending suspected credentials to outside
services. A clean scan does not make private correspondence or internal records
appropriate for publication; review those separately. Rotate any real exposed
credential before coordinating a history rewrite, including cached PR refs.

After the owner chooses to make the repository public:

1. Verify secret scanning, push protection, Dependabot alerts and security
   updates are enabled. Enable private vulnerability reporting.
2. Require approval for **all outside collaborators** before fork pull-request
   workflows run. Keep the default Actions token read-only and Actions approval
   of pull requests disabled.
3. Apply both rulesets. Confirm the required contexts are exactly `checks` and
   `pr-title`, owned by GitHub Actions, and that only the owner has admin access.
4. Run Security analysis on `main` and confirm CodeQL's JavaScript/TypeScript
   and Python analyses and Scorecard upload succeed. These jobs skip private
   repositories. The Scorecard report stays in GitHub code scanning; it does
   not publish to the separate Scorecard service.
5. Deploy and check `https://posvoji.si/.well-known/security.txt` without a
   login, and renew its expiry before 2027-09-01.

The current MIT/AGPL licence split remains unchanged. A CLA or a release bot
requires a separate maintainer policy decision; neither is a merge prerequisite.

References: [GitHub rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets),
[fork workflow approvals](https://docs.github.com/en/actions/managing-workflow-runs/approving-workflow-runs-from-public-forks),
[Dependabot cooldown](https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference#cooldown).
