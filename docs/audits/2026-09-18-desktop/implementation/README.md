# Desktop fixes: implementation and verification

First batch implemented and checked on 18 September 2026 against `f2b7a79`, the locally available `origin/main`, on branch `codex/desktop-navigation-fixes`. Application changes live in the isolated `desktop-audit-fixes` worktree. The original working tree's application changes were left intact.

The documentation corrections are complete: em dashes were removed, D16 now says unused column **height**, and the verdict is called the **review verdict**. `verdict.md` remains unchanged.

## First navigation batch

| Finding | Result | Verification |
| --- | --- | --- |
| D02 | PageUp/PageDown scroll the detail card while content remains in that direction. Sibling navigation happens only at the boundary. Existing lightbox containment guards remain. | At 1366x660, PageDown kept Balta open and moved the card from 100px to 446px of a 623px range. Gulya scrolled to its bottom before the next key opened Miray. Unit tests cover both directions and portal guards. |
| U1 | Each newly selected animal starts at the top of the reused detail card. | Balta at 446px changed to Gulya at 0px, with Gulya still having a 204px scroll range. This exercises real overflow, unlike the original negative-test screenshot. |
| D03 | The standalone page's view-all link goes to the locale's bare index and says “Poglej vse živali” / “View all animals”. Legacy incoming `zival` parsing remains. | Reloaded Ficko as a standalone page, clicked view-all, and reached `/` with no dialog. Both locale destinations are unit-tested. |
| D04 | The card's selected photo reaches the dialog, its URL, and the opening animation. | Ficko photo 2 remained photo 2 with the same image source after opening, with `?foto=2`. A unit test checks the opening animation's selected image; the screenshot captures the settled dialog. |
| D05 | Filtering completes the scroll immediately so Motion cannot restore an intermediate smooth-scroll position. | A 710px return, within two viewport heights at 1440x768, settled at scrollY 231px with the results anchor at 0px and the first card at 113px. Unit coverage includes distant scrolling after modal locks release and no movement when already above the results. |
| D07 | Language links contain the current query before any click, so native new-tab and copy-link actions preserve filters. | Middle-click opened `/en?vrsta=pes&energija=miren`; Dogs and Calm remained selected. Tests also cover query updates, browser history, and context-menu events. |

## Evidence

- [Browser measurements](browser-checks.json)
- [Gulya starts at the top while its card still overflows](01-gulya-scroll-reset.png)
- [Photo 2 survives opening the dialog](02-selected-photo-preserved.png)
- [Filtered results remain aligned after settling](03-filter-results-top.png)

Screenshots use the local development preview with the development toolbar removed. They are implementation evidence, separate from the original audit and its review measurements.

## Validation

`corepack pnpm check` completed successfully:

- Type checking and lint passed. Lint retains the existing unused `CARDS_PER_CLICK` warning in `animal-grid.tsx`.
- 3,714 JavaScript/TypeScript tests passed, including 2,677 web tests.
- Portal tests: 364 passed, 4 skipped.
- Provider policy validation: 16 valid, 0 invalid, 13 enabled.
- Production web build generated 2,009 static pages.

The local check log is retained as ignored `check.log`; it is not part of the portable evidence bundle. Build-generated changes to two share images were discarded because they are unrelated to this batch.

## Scope remaining after the first batch

At this point only the first navigation and continuity batch was complete. The sections below record the subsequent work; the [final disposition of all 34 entries](STATUS.md) is the current status. D11, D22 and D28 remain product decisions, and D15, D18 and D23 remain withdrawn.

## Quality review, 19 September 2026

Reviewed the first batch for reuse, simpler control flow, repeated work and clear responsibilities. No additional audit findings were implemented.

- Integrated `main` at `6e94362` to resolve conflicts with its native card-to-dialog photo transition. The selected photo now passes through both native and fallback opening paths. The obsolete PhotoBloom assertion was replaced with integration coverage of the image captured before and after the native transition update.
- Shared photo-query validation and formatting between standalone sharing links and dialog opens. Each caller still owns its own path and filter handling.
- Isolated detail-card paging from keyboard navigation. Scroll dimensions are read once, and the handler now expresses the choice between reading more content and changing animals.
- Renamed the internal view-all label to match its behavior and grouped its locale tests with the page's onward links.
- Simplified the scroll test to assert the immediate browser request, removed an unused media-query stub, and centralized language-test navigation suppression.

The screenshots and measurements above remain the evidence from 18 September. The opening-animation implementation described there was superseded by the integrated native transition.

Validation: `corepack pnpm check` passed after integration and cleanup: 3,746 JavaScript/TypeScript tests (2,709 web), 364 portal tests with 4 skipped, type checking, lint, policy validation and the 2,009-page production build. The existing `CARDS_PER_CLICK` lint warning remains. The ignored local log is `quality-check.log`.

A browser smoke check at 1280x720 confirmed that Ficko's second card photo opened as photo 2 with the same image source and `?foto=2`; closing returned to `/` with no dialog. Native transition capture and fallback behavior are covered by the updated integration tests.

## Energy information, 19 September 2026

- **D08:** the existing energy hint now includes the number of animals with recorded energy after applying the other filters. It reuses the energy facet counts, so choosing an energy level does not reduce the coverage count. Unknown values remain excluded when filtering by energy. No persistent coverage block or include-unknown control was added.
- **D09:** the shared animal details render recorded energy with the existing identity pill, icon and localized filter label. This covers both the dialog and standalone page. Missing energy produces no fact and is never inferred from descriptive text. The existing safeguard for listings that name several animals still applies.

Regression coverage includes all three energy levels in both languages, an energy-only record, missing data, zero coverage and coverage updates when other filters change.

Browser verification at 1280x720 used the local 486-animal dataset. With dogs selected, the tooltip reported 3 recorded energy answers; selecting Miren reduced the results to Reks and Biba while keeping that coverage count at 3. Reks displayed Miren in the dialog and Slovenian standalone page, and Calm after switching the standalone page to English. The new fact used the existing compact identity row without clipping.

Validation: `corepack pnpm check` passed: 3,755 JavaScript/TypeScript tests (2,718 web), 364 portal tests with 4 skipped, type checking, lint, policy validation (16 valid, 0 invalid, 13 enabled) and the 2,009-page production build. The existing unused `CARDS_PER_CLICK` lint warning remains. The ignored local log is `energy-check.log`.

## Verification age, 19 September 2026

**D10:** the existing warning keeps its placement and 30-hour threshold, but now names the elapsed time of a known source check. It uses completed hours below 48 hours and completed days thereafter, localized in Slovenian and English. The shelter-availability advice remains first. Missing, invalid or implausibly future dates show the unknown-date footnote and the advice without inventing an age.

The static page starts with its server reference so hydration remains consistent, then the existing minute timer updates the age. The source timestamp and machine-readable date remain unchanged. Regression tests cover 31 hours versus 12 days, the hours-to-days boundary, the existing five-minute clock tolerance, unreliable dates, both languages and an open page aging into another day.

Browser verification at 1280x720 confirmed Reks's warning below the shelter action in the dialog and both standalone locales. After hydration it read “pred 13 dnevi” / “13 days ago”, with the source timestamp still `2026-09-05T18:50:30.148Z`. The warning remained readable without clipping. Initial static text used the publication reference before advancing to the current age.

Validation: `corepack pnpm check` passed: 3,770 JavaScript/TypeScript tests (2,733 web), 364 portal tests with 4 skipped, type checking, lint, policy validation (16 valid, 0 invalid, 13 enabled) and the 2,009-page production build. The existing unused `CARDS_PER_CLICK` lint warning remains. The ignored local log is `verification-age-check.log`.

## Recovery and destination wording, 19 September 2026

- **D14:** the found-animal heading and metadata ask “Kje si našel žival?” / “Where did you find the animal?”. The homepage invitation retains its existing wording through a separate label. The input's accessible name and placeholder are unchanged.
- **D30:** empty results offer “Pokaži vse vrste ({count})” / “Show all species ({count})” when another species matches, even with active chips. The count reuses the existing species facet tally. Clicking widens the species scope through the existing action and preserves the other applicable filters. Filter clearing stays in the existing chip rows and does not reset species; current upstream already removed the redundant empty-block clear at every width.
- **D31:** the English header says “Shelter login (Slovenian)”. Both the large-screen link and dropdown inherit `hrefLang="sl"` from the shared portal destination. Slovenian wording and portal behavior are unchanged.

Regression coverage checks recovery with active shelter and sex filters in both languages, the count against the resulting cards, no recovery when all species have zero matches, existing clear behavior, both portal links and the unchanged homepage invitation.

Browser verification: at 1280x720, `/?vrsta=ostalo&zavetisce=muri` offered “Pokaži vse vrste (53)” beside the existing shelter recovery. Clicking it produced 53 results at `/?zavetisce=muri`, retaining the shelter chip. Both found-animal headings matched their page titles. At 1024x768 the English heading and login label fit without horizontal overflow; at 960x720 the dropdown showed the same portal notice. Both portal links exposed `hreflang="sl"`.

Validation: `corepack pnpm check` passed: 3,774 JavaScript/TypeScript tests (2,737 web), 364 portal tests with 4 skipped, type checking, lint, policy validation (16 valid, 0 invalid, 13 enabled) and the 2,009-page production build. The existing unused `CARDS_PER_CLICK` lint warning remains. The ignored local log is `recovery-copy-check.log`.

## Device-location safeguards, 19 September 2026

**D01:** the page-session location retains the browser's accuracy in metres. A nearby municipality stays a suggestion when accuracy exceeds 1,000 metres or is missing or invalid, including a singleton. The existing choice list supports mouse and keyboard confirmation; until then the map receives no settled answer and the URL stores no municipality. Typed places and precise singleton fixes retain their existing direct resolution.

The nearest-postal lookup rejects invalid coordinates and fixes more than 20 km from the nearest postal centroid. The finder then asks for the finding place to be typed and offers the shelter directory. The 1 km accuracy threshold and 20 km distance ceiling are conservative lookup limits, not municipal boundaries or proof that a fix is inside Slovenia. Nearby cross-border points and fine fixes close to a municipal border remain limited by the existing postal-centroid approximation.

Regression tests cover the accuracy threshold, invalid accuracy, London, Vienna, Zagreb, New York, invalid coordinates, a coarse singleton confirmed by keyboard, typed recovery, the absence of an unconfirmed URL/map answer, and retained accuracy across responsive remounts. Existing cancellation, timeout, browser-error and typed-place tests continue to pass.

Browser verification at 1280x720 confirmed that typing `1000` still directly resolves Ljubljana, while Križevci stays a four-option choice until keyboard confirmation writes `kraj=Križevci`. Device responses were verified in automated hook/component tests. Browser simulation was unavailable because the browser tool does not support pre-navigation script injection; native permission prompts and the new device-state layouts were not browser-verified.

Validation completed across runs: type checking, lint, all 3,791 JavaScript/TypeScript tests (2,754 web), 364 portal tests with 4 skipped, policy validation (16 valid, 0 invalid, 13 enabled) and the 2,009-page production build passed. The first full run hit an unrelated photo-animation timing assertion, which passed alone and in the next full web run. That rerun had an ingestion worker exit unexpectedly; all 532 ingestion tests passed on a separate rerun, followed by the remaining checks. The existing unused `CARDS_PER_CLICK` lint warning remains. Ignored local logs are `device-location-check.log`, `device-location-recheck.log` and `device-location-remaining-checks.log`.


## Remaining controls and short-height refinements, 19 September 2026

- **D16:** both shelter-name renderers allow two lines at every width. The existing list width and map split remain.
- **D17:** a media-query subscription changes only the sidebar's unstored age default below approximately 800px desktop height. It does not write a preference. Explicit open/closed choices retain priority and the mobile sheet retains its existing defaults and active-filter handling.
- **D19:** desktops between 512px and 800px high use 32px page padding and a 24px section gap. The cat corner shrinks with that band to preserve its aspect and caption clearance. Tall desktops and landscape-phone behavior remain.
- **D21:** filtered hollow markers have a dashed stroke, while unpublished shelters retain a solid hollow circle. Lone markers, clusters, satellites and legend swatches share the pattern. Each legend caption appears only when its state occurs.
- **D25:** local `select-text` on shelter phone, on-call and email anchors, and coverage call anchors, restores selection without changing the shared button behavior or adding copy controls.
- **D26:** input, select and outline-button primitives now own `border-control-border`. Removed the obsolete `CONTROL_FRAME` helper, its redundant uses and the input/select overrides it replaces. Focus and invalid-state rules remain. Quiet toolbar overrides and other primitives retain their existing contracts.
- **D27:** one route-state helper reads the existing locale path map for both navigation layouts. Exact destinations retain `aria-current="page"`; guarded descendants receive a dotted underline and normal weight. Similar prefixes and locale roots do not count as descendant matches.
- **D32:** the localized age hint names the under-one, one-to-under-eight and eight-plus ranges. It now connects to the shared header info tooltip; row labels, individual tooltips and the grove remain. No extra row of permanent text was added.

The quality pass removed redundant styling wrappers and obsolete explanations rather than introducing new control abstractions. Regression coverage exercises the shared map legend/marker distinction, navigation route boundaries in both languages, and the short-desktop preference behavior. Existing presentation assertions were updated for the age hint and cat corner.

### Final browser verification

The local development preview used the 486-animal dataset. All five upstream items were verified: D06 standalone count and full-image viewing; D12 presence-gated hours/on-call details; D13 project-email joining invitation; D29 unknown-place directory links in both languages; U2 photo 3 preserved through the standalone share link and reopening.

At 1366x768 and 1024x768, first photos start at y=276 instead of the review's y=308. The short-height cat figure is 128x123.3 at y=75.7, below the header's y=73 edge. At 1440x900 the first-photo y=308 and 168px cat width remain. The English 1024px layout has no horizontal overflow.

A fresh preview origin confirmed that age starts collapsed at 1366x768, opens at 1440x900, and stays explicitly open after reloading at the shorter height. Keyboard navigation exposes the age-range tooltip. A 390x844 check confirmed the mobile sheet's retained age section and controls.

The Koper name uses 39px of height with matching scroll height in the picker. The filtered-dog map shows both solid and dashed hollow circles with matching legend rows in light and dark modes. Shelter/coverage contact anchors compute `user-select: text`. The shared picker field, shelter outline contacts and portal login field resolve to the control-border token; the focused login field resolves to the focus token. The English dropdown marks the shelter parent with a dotted underline and no `aria-current`, matching the desktop row.

**D20 and D24 assessed and retained:** the review established that the fan is readable and uncropped with a lightbox. Its optional tall-screen enlargement would alter a settled composition without fixing a demonstrated problem. The Koper contact column fits both 348px call actions and readable wrapped hours; widening it would take space from the map. Both are recorded as retained choices rather than unfinished fixes.

These checks used temporary browser tabs and viewport/theme emulation, all closed or reset afterwards. The Next.js development toolbar was visible in inline inspection screenshots and was not treated as a product element or used for hit-target conclusions. No additional screenshot files are claimed; numerical observations are in [final-browser-checks.json](final-browser-checks.json).


### Final validation

`corepack pnpm check` passed in one complete run after the last implementation change: type checking, lint, all 3,795 JavaScript/TypeScript tests (2,758 web), 364 portal tests with 4 skipped, policy validation (16 valid, 0 invalid, 13 enabled), and the production build with 2,009 static pages. Lint retains the pre-existing unused `CARDS_PER_CLICK` warning. The ignored local log is `desktop-completion-check.log`.

Before the final run, two existing presentation assertions were updated to match the new age hint and cat-corner class. The focused suite then passed all 237 tests. Build-generated changes to the two unrelated share images were discarded. The verdict remains unchanged, and the final notes contain no em dashes.


## Final upstream reconciliation

While the final commit was being pushed, `main` advanced to `a400178` with reviewed animal facts from PR #258 and care-label/shelter-name readability from PR #261. The only conflict was D16's two equivalent class orders. Kept the upstream two-line shelter classes; the care-filter wrapping changes and reviewed data were preserved. The browser measurements above precede this integration; the changed shelter classes have the same behavior.


After reconciliation, `corepack pnpm check` passed again in full: 3,797 JavaScript/TypeScript tests (2,758 web), 364 portal tests with 4 skipped, type checking, lint, 16 valid policies with 0 invalid and 13 enabled, and all 2,009 generated pages. The two additional tests came from upstream ingestion coverage. The existing lint warning is unchanged. The ignored log is `desktop-integrated-check.log`.
