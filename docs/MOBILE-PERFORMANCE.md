# Mobile performance

Sections A and B of the mobile performance report, based on `934ff1a`.

## Page loading

- Inline production CSS and use `font-display: swap` for both Latin Inter
  and the Slovenian subset. Only the small Slovenian subset is preloaded.
  Latin-only `optional` left cold visits mixing Arial letters with Inter
  accents, so both faces now swap when ready. Inlining trades
  an earlier first paint for larger HTML on repeat visits; see
  [DEPLOY-HEADERS.md](DEPLOY-HEADERS.md).
- Prerender 24 cards and retain first-photo blur only for those animals in
  default display order. Filtering, counts and dialog navigation use the full
  dataset. Without JavaScript, 24 cards remain visible.
- Replace repeated card chevron SVGs with a shared CSS mask and remove gallery
  controls' backdrop filters.
- Increase the filtered-link hydration fallback from six to ten seconds.
- Generate 96px and 192px shelter-logo variants, without enlarging small
  sources. Avatars select by actual image and display width. Existing manifests
  remain valid; the next logo fetch/export generates the variants without an
  additional shelter request. Publication and retention include every variant.

## Deferred UI and data

The filter sheet and picker bodies load separately, warmed on idle or pointer
and keyboard focus. Buttons render immediately. History and picker session
state remain mounted so Back, Escape, breakpoint changes and spotlight links
work during loading. Failed imports offer retry.

The homepage passes a generated municipality-data URL instead of the localized
table. The map loads it on open and shares the result across picker instances.
The found-animal page keeps its server-rendered data.

Homepage and shelter grids carry one permitted photo and a gallery URL/count.
Opening the fan or interacting with card photos fetches the remaining metadata.
Requests are shared and cached, with response validation, a 15-second timeout
and retry. The first photo remains visible on failure. Shared links retain a
secondary-photo selection until the gallery arrives. Standalone animal pages
keep their complete gallery.

Dev/build generate these JSON files from the validated dataset. Content hashes
prevent mixing a cached page with another dataset's metadata. Regeneration
removes obsolete files owned by this generator. If an old page requests a
retired payload, its first photo remains visible; reloading gets the current
page.

Static animal and shelter pages load their lightbox/dialog on demand. Their
initial scripts no longer include Motion. The plain gallery keeps its existing
CSS gestures and uses a media-query subscription for reduced motion. Animation
configuration now lives beside the animated surfaces.

The dialog's initial touch focus moves after paint to avoid forcing layout
before the shell appears. Keyboard focus remains immediate. Deferred focus is
skipped if the dialog closes or the visitor moves focus elsewhere.

## Measurements

For the 488-animal dataset used during implementation, before the desktop
performance changes in #284 were integrated:

| Serialized data | Before | After |
| --- | ---: | ---: |
| Animal props, raw | 379,977 B | 310,560 B |
| Animal props, gzip | 45,463 B | 34,831 B |
| Municipality prop, raw | 108,123 B | URL only |
| Municipality prop, gzip | 5,481 B | URL only |

These are isolated JSON sizes, not whole-document transfer savings.

Three local phone-profile runs before and after B used 412×823, DPR 1.75,
4× CPU, 150 ms latency and 1.6 Mbps networking. Median title insertion moved
from 412 ms to 341 ms; focus self-time from 109–151 ms to 8–33 ms. Median
largest opening task moved from 397 ms to 354 ms, with overlapping ranges.
These small-sample results do not establish an INP score or meet the 200 ms
target. The comparison used the same surrounding branding changes. No new
FCP/LCP claim is made.

## Validation

Required checks: `pnpm typecheck`, `pnpm lint`, `pnpm test`,
`pnpm validate:policies`, and `pnpm --filter web build`.

Tests cover logo generation/retention, default-sort blur trimming, deferred
imports and cancellation, shared payload requests, retry, rapid animal changes,
keyboard photo steps and pending shared-photo selection. Browser checks cover
mobile drawers, picker history and touch, dialog navigation, gallery gestures,
lightboxes, desktop keyboard behavior and eight existing visual baselines.
The visual gallery routes run in development; production intentionally omits
them. CDP-only gesture cases retain their existing WebKit skips.

A production failure/retry check verifies no photo-metadata requests before
interaction, the first photo surviving a 503 response, and retry preserving
photo 3 of 13 from a shared link, without runtime errors.
