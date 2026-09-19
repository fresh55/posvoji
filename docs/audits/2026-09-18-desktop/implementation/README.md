# Desktop fixes: implementation progress

Implemented and checked on 18 September 2026 against `f2b7a79`, the locally available `origin/main`, on branch `codex/desktop-navigation-fixes`. Application changes live in the isolated `desktop-audit-fixes` worktree. The original working tree's application changes were left intact.

The documentation corrections are complete: em dashes were removed, D16 now says unused column **height**, and the verdict is called the **review verdict**. `verdict.md` remains unchanged.

## Completed in this batch

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

## Remaining scope

This is the first navigation and continuity batch, not completion of the full audit. All other findings retain their decisions in the [reconciled plan](../README.md). D11, D22 and D28 remain product decisions; D15, D18 and D23 remain withdrawn. The five upstream fixes remain verify-only. The standalone photo count and enlarge control were observed during D03 verification, but a full verification of those upstream items is still pending.

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
