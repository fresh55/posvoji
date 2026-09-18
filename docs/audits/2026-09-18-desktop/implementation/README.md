# Desktop fixes: first implementation batch

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
