# Host and crawl follow-up audit

Verified on 17 September 2026 around 19:45–19:50 UTC. The host checkout is
`d1e8c76`; these findings were also compared with current `origin/main`
(`eadae22`). No host configuration or published data was changed in this audit.

## Scheduling verdict

PR #237 (`977d546`) correctly classifies a skipped provider by whether its
successful check is still inside the current interval. Comparing which saved
timestamp wins the maximum would misclassify an attempt admitted before an
interval was widened. The widened-interval regression is present; the schedule
and export tests passed locally (21 tests), and the PR's CI checks succeeded.
The PR remains open, so its scheduling changes are not installed on the host.

## Host findings

- `/srv/posvoji/.layout-v2` is absent. Both relevant Caddy roots still use
  `/srv/posvoji/current`, and the current release has neither the v2 public
  directory nor the private publication receipt. The 19:20 deployment warned
  that it withheld private artifacts. This is a real migration backlog, not a
  reason to create the marker alone. Follow `docs/DEPLOY-MEDIA.md`, adapting
  its scheduler pause/resume steps to the active host timer; the Windows crawl
  tasks remain retired. Complete the manual v2 deployment and rollback drill.
- There are 57 retired artifact-lock directories containing 21,283 bytes of
  owner records, plus filesystem overhead. `prune-retired-locks.mjs` retains
  current-boot tombstones deliberately: a suspended retirement process could
  otherwise disturb a successor lock. Growth is unbounded within a long boot,
  but an age-only deletion rule would break the concurrency guarantee. Treat
  this as a lock-protocol maintenance task, not urgent disk recovery.
- A fresh portal response at 19:50:24 UTC named Johanca and Oskar among its
  providers and contained zero listings. The published and crawled datasets
  likewise contain zero animals from those two shelters. This is a successful
  empty feed, not a missing feed or authentication failure. Keep their registry
  pages: `shelter-detail-page.tsx` already explains that no listings on Posvoji
  does not mean there are no animals at the shelter, and supplies its contacts.

## Code findings

- Carried records have no maximum age. Retention checks current publication
  permission, provider enablement and path restrictions, but not age.
  `lastSeenAt` is read by the sitemap, so “nothing reads it” is too broad; no
  retention decision uses it. The current host's oldest published observation
  was 08:16:14 UTC that morning, so this audit did not find a currently ancient
  animal. A future fix should distinguish unknown freshness from adoption and
  define a retention policy explicitly.
- Server `Retry-After` values bypass the exponential-backoff cap and are saved
  without expiry in `host-cooldowns.json`. A 100-year numeric header produces a
  100-year deferral; an overflowing numeric header becomes Infinity and then
  `Number.MAX_SAFE_INTEGER`. Those values remain valid scheduling state on the
  next process start. No persisted cooldown file was found in the host data
  tree during this audit. Reject malformed values and surface exceptional
  deferrals for operator recovery; silently shortening a legitimate server
  cooldown would violate the crawler's rate-limit contract.
- Connection-level robots failures are not cached after the pending request
  completes. The next URL starts another robots attempt and retry budget. This
  is different from terminal HTTP 5xx robots responses, which cache a deny-all
  result. Existing SDK tests explicitly exercise the retry-next-time behavior
  (51 SDK tests passed). A bounded, per-origin failure cache should retain the
  fail-closed behavior and allow recovery after its timeout.

## Mala hiša private path

The public adoption archive links to `/privat-oddaja/`, which was already
excluded. Its public sitemap index also identifies a separate `privat_oddaja`
post type. The policy lacked `/privat_oddaja/`; the existing adapter test even
used the different spelling `privat_oddajo`.

Direct provider requests are restricted to the two adoption-detail paths, but
the shared redirect guard only applies policy exclusions. A synthetic redirect
from an adoption URL to `/privat_oddaja/fixture/` passed that guard before this
change. The new regression failed on the old policy and passes with the added
exclusion. The same policy also governs carried-record publication. The
provider test now uses the private post-type spelling. No private listing body
was fetched or stored, and the host's 12 Mala hiša records all use the dog
adoption path. This proves a missing guard, not an observed private-data leak.

Source navigation and sitemap metadata were read through the provider SDK's
polite client. The policy repair is prepared in this branch; it is not yet
installed on the host.

The repair passed `pnpm typecheck`, `pnpm lint`, `pnpm test`, and
`pnpm validate:policies`. Lint retained the existing unused `CARDS_PER_CLICK`
warning in the web app. No web implementation changed.
