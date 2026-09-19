# Desktop audit - reconciled findings and plan

Updated 18 September 2026 against the [review verdict](verdict.md). **This document replaces the original recommendations.** The verdict is unchanged.

The review approved 8 of the original 32 findings, approved 21 with changes, and disapproved 3. Both previously unverified candidates were subsequently confirmed. These decisions are not a count of outstanding fixes: several changes already exist upstream, some are optional, and others require a product decision.

The original audit overstated some visual problems, missed existing affordances, and proposed changes that conflict with settled design decisions. **D15, D18, and D23 are withdrawn.** Preserve the photo fan, age grove, meaningful icon sizing, nested sidebar scrolling, two-fact card limit, and species-reset contract.

[Original audit - superseded](ORIGINAL-AUDIT.md) · [36 original screenshots](EVIDENCE.md) · [Original validation results](validation/README.md)

**Implementation progress, 19 September:** completed findings are D02, U1, D03, D04, D05, D07, D08, D09, D10, D14, D30 and D31. These cover navigation continuity, energy information, verification age, the finding-place heading, cross-species recovery and the portal's destination language. Work is on an isolated branch initially based on `f2b7a79`, now integrated with `main` at `6e94362`. See [implemented behavior, browser evidence and passing checks](implementation/README.md). The remaining findings retain the decisions below.

## Evidence and upstream baseline

The original screenshots describe the audited local working tree, not current production or a refreshed upstream checkout. The verdict identifies that tree as `d1e8c76` plus in-flight changes, 20 commits behind its recorded `origin/main` at `f2b7a79`. Those revision and upstream claims are attributed to the verdict; no fetch, rebase, merge, or fresh upstream browser verification was performed for this documentation revision.

The verdict reports four read-only verification lanes and additional measurements at shorter desktop heights. Their artifacts are referenced there, not copied here. New measurements below belong to that review and must not be attributed to the original screenshots.

| Item | Upstream status reported by verdict | Consequence |
| --- | --- | --- |
| D06 | Standalone `PhotoLightbox` exists | Verify visible photo count; do not rebuild the gallery as a fan |
| D12 | Hours/on-call information added in PR #249 | Verify presence-gated rendering; no address/directions field exists |
| D13 | Join invitation changed to project email in PR #249 | Verify rather than implement again |
| D29 | Unknown-place branch links the directory in PR #253 | Verify rather than implement again |
| U2 | Selected photo reaches sharing through `AnimalPagePhotoProvider`, PR #253 | Verify rather than implement again |
| D26 | `--control-border` exists in PR #255 | Use that token only after upstream integration |
| D16, D21 | Picker files rewritten in PR #254 | Reinspect the integrated components before editing |

Upstream integration is a prerequisite for later code work, not authorization to rebase this dirty working tree during a notes revision.

## Corrected decisions for all findings

Stable IDs are retained. “Approved” records the verdict's assessment, not blanket approval to implement optional product features. Paths and line numbers in the verdict refer to the reviewed tree and may move upstream.

### D01 - Amend: qualify unreliable device location only

The hook drops accuracy, the nearest-postal-centroid lookup has no distance ceiling, and a singleton is auto-accepted. Offline review returned Slovenian municipalities even for London and New York. Browser permission handling remains untested.

**Action:** carry `coords.accuracy`, add a maximum distance to `municipalitiesNear`, and demote coarse/out-of-range device fixes to suggestions. Preserve existing ambiguity handling and typed-place behavior. Withdraw blanket confirmation for every inferred municipality. Evidence: verdict D01; [lookup screen](screenshots/19-found-animal-result.png).

### D02 - Amend: scroll before changing animals

PageDown changes animals while unread description remains. The review confirmed Balta → Gulya with 402px unread. Labeled controls already exist; the shortcut is deliberate, and the containment guard excludes the portalled lightbox.

**Action:** let the detail card consume the key while it can scroll in that direction; step to the sibling only when already at that end. Keep the containment guard. Test at 768px height or lower as well as tall layouts. Evidence: verdict D02; [original key result](screenshots/07-page-down-changes-animal.png).

### D03 - Amend: fix the view-all href, retain parsing

The standalone page writes its own `?zival=` and reopens the same animal. This is distinct from old incoming links.

**Action:** use `indexHref` alone for the view-all link. Keep existing `zival` parsing for other callers and legacy links. Reported still open upstream. Evidence: [standalone](screenshots/14-standalone-animal.png), [reopened dialog](screenshots/15-view-all-reopens-dialog.png).

### D04 - Approved: preserve the selected photo and opening image

A card on photo 2 opens the dialog on photo 1; the URL photo parameter already works.

**Action:** carry the card's selected photo index into the dialog and make the opening animation use the same image. Its current `images[0]` assumption becomes false after the handoff fix. Evidence: verdict D04; [card](screenshots/33-card-second-photo.png), [dialog](screenshots/34-dialog-resets-card-photo.png).

### D05 - Amend: repair the scroll Motion cancels

The symptom is real, but the original explanation was wrong. `scrollToResults` already runs. The review found Motion's `measureAllKeyframes` restores a captured position about 46ms later, cancelling smooth scrolling. The longer-distance instant branch succeeds.

**Action:** reassert the target after the results commit, or remove the smooth branch. Use `window.scrollTo`, not `scrollIntoView`. Verify a filter toggle within two viewport heights and the longer-distance branch. Evidence: verdict D05; [clipped result photos](screenshots/03-filtered-results.png).

### D06 - Amend; partly upstream: lightbox and visible count

The audited direct page cropped the portrait, had no enlarge control, and kept its count screen-reader-only. The verdict reports an upstream lightbox but did not check count visibility.

**Action:** verify that lightbox and add a visible count only if still missing. Do not introduce the fan on the standalone page. Evidence: verdict D06; [old standalone gallery](screenshots/14-standalone-animal.png).

### D07 - Approved: render the full language destination

The review confirmed auxiliary/context-menu navigation gets the bare locale route. Left-click mutates the href, so later auxiliary clicks can also inherit stale filters. Query keys are locale-independent.

**Action:** subscribe through `lib/location-search.ts`, render the current query in the href, and remove `keepFilters`. Verify left-click, middle-click, context-menu open, copy link, and intervening filter changes. Evidence: verdict D07; [filtered state](screenshots/35-filtered-before-language.png).

### D08 - Amend: quantify coverage in the existing hint

Only 3 of 120 dogs carry energy. “Uravnotežen 0” is disabled, not offered as a selectable match. The tooltip already explains that unknown values are hidden; it lacks the scale.

**Action:** add the applicable count to `energyFilterHint`. No persistent coverage block and no include-unknown control. Evidence: verdict D08; [energy options](screenshots/02-filters-energy.png).

### D09 - Approved: show recorded energy in facts

Energy is the only filter dimension absent from structured facts. The review counted 38 of 486 animals with energy: 19 calm and 19 lively.

**Action:** render recorded energy with other facts, without inferring unknown values. Evidence: verdict D09; [Reks detail](screenshots/36-energy-detail.png).

### D10 - Amend: say how old verification is

The warning already appears below the shelter action. The remaining defect is wording: a fixed string describes both 31-hour-old and 12-day-old checks, with the oldness threshold at 30 hours.

**Action:** localize the actual age and retain appropriate unknown-date handling. Withdraw the extra status-placement recommendation. Do not add an individual-animal phone action. Evidence: verdict D10; [verification copy](screenshots/36-energy-detail.png).

### D11 - Approved product gap; decision required: name search

Neither index has an animal-name input; name sorting does exist. This is a feature opportunity, not a regression.

**Option:** a separate feature covering contracts, URL state, engine, prehydration deep links, toolbar, chips, and localization. Leave outside the defect batch until Bruno chooses it. Evidence: verdict D11; [index](screenshots/01-home-1440.png).

### D12 - Amend; replacement upstream: available visit information

The registry contains no address field, so directions cannot be built from current data. The overview map is small and deliberately capped; withdraw the claim that it wastes the header.

**Action:** retain the map and verify upstream hours/on-call information gated on presence. The review found hours on 10 of 17 entries, on-call on 5, and neither on 6. No address/directions work. Evidence: verdict D12; [old shelter detail](screenshots/17-shelter-detail.png).

### D13 - Approved; already upstream: email onboarding

The audited invitation used GitHub. PR #249 reportedly replaced it with the project email.

**Action:** verify the integrated change; no duplicate implementation. Evidence: verdict D13; [old invitation](screenshots/28-shelter-onboarding.png).

### D14 - Approved: ask where the animal was found

The input has an accessible name and placeholder. The visible heading asks whether the visitor found an animal, not where.

**Action:** make `muniPromptTitle` name the finding place; metadata uses the same key. Preserve existing input accessibility. Evidence: verdict D14; [lookup start](screenshots/18-found-animal-start.png).

### D15 - Withdrawn: navigation already distinguishes its scope

The review verified distinct accessible names, a live “Naslednja žival” tooltip, and photo chevrons inside the front print. Placement follows the settled PR #213 decision. No arrow relocation or visible-label redesign is proposed. The [original screenshot](screenshots/06-animal-dialog.png) does not establish missing affordances.

### D16 - Amend: wrap the one long shelter name

The panel has 351 usable list pixels; exactly one of 11 names truncates, by 22px. The map is height-bound, with more unused column height at 1366×768.

**Action:** after PR #254 integration, keep `line-clamp-2` at desktop widths instead of `lg:truncate`. Optionally widen the panel from 24rem to 26rem if measurement warrants it. Preserve the split; no list-first redesign. Evidence: verdict D16; [picker](screenshots/04-shelter-picker.png).

### D17 - Amend: short-height default collapse only

The claim that energy, health, and household controls are all initially hidden at 1440×900 was too broad. The review measured 939px content within 744px at 768px viewport height. Saved accordion state affects comparisons.

**Option:** default Starost to collapsed below roughly 800px height, respecting persisted choices. Keep the grove and nested scrolling. Withdraw the generic advice to remove independent scroll regions. Evidence: verdict D17; [small desktop](screenshots/27-small-desktop-1024.png).

### D18 - Withdrawn: intentional icons and consistent selected states

All seven sections already share the selected-state treatment. Age/size icon scales carry meaning; sex icons use the documented grid. Keep the icon-driven controls and grove. Stroke normalization from 1.7/1.75 to 1.65 is optional polish, not a defect fix. Evidence: verdict D18; [index](screenshots/01-home-1440.png).

### D19 - Approved with causal correction: short-height spacing

First-photo y=308 was confirmed. The cat is absolutely positioned and adds no flow height; strike the original attribution to its reserved area.

**Action:** consider a desktop height band with `--page-y: 2rem` and `--section-gap: 1.5rem`. The verdict estimates y=276 with both changes; this is a proposed outcome, not an implemented result. Recheck cat positioning against the section gap. Evidence: verdict D19; [1024×768](screenshots/27-small-desktop-1024.png).

### D20 - Amend to optional refinement: preserve the fan

The central print is uncropped and readable, and one click opens the lightbox. Withdraw the legibility argument and replacement-gallery recommendation.

**Option:** relax `DESKTOP_STAGE_ASPECT` on tall viewports only. Preserve the fan and short-height behavior; this is not a required defect fix. Evidence: verdict D20; [laptop detail](screenshots/10-dialog-laptop-1366.png).

### D21 - Amend: distinguish identical glyphs everywhere

The two empty states use the same glyph in both legend and map, not merely similar styling.

**Action:** after picker integration, add an `EmptyMarkerGlyph` variant used by both renderers. A dashed filtered-state stroke can match the existing filtered-region boundary. Do not use opacity as the distinction. Evidence: verdict D21; [legend](screenshots/04-shelter-picker.png).

### D22 - Approved observation; constrained product choice

Cards keep two facts, with sex ranked third. The review counted dogs as 44 age/size, 44 age/sex, 7 size/sex, 23 one fact, 2 none. Fixed slots are explicitly rejected in the current design; placeholders would create many gaps.

**Choices:** retain the current policy, or choose to omit sex from cards. Never add a third fact or fixed placeholder slots. Leave outside automatic fixes until decided. Evidence: verdict D22; [example cards](screenshots/35-filtered-before-language.png).

### D23 - Withdrawn: the logo gap follows shared-row alignment

Only 2 of 17 entries lack logos. Their approximately 48px band inherits the neighbor's subgrid row height; reclaiming it would misalign the row. Do not restore the previously removed initial-avatar fallback. The stale comment claiming six missing logos is separate documentation cleanup. Evidence: verdict D23; [directory](screenshots/16-shelter-directory.png).

### D24 - Amend to optional ratio change: contact already leads

The shelter already leads in DOM and left-column order. On-call is an equal outline button, not buried subdued text. Withdraw both claims.

**Option:** evaluate changing the contact column from 24rem to 28rem. The map has no width slack, so the picker's empty-space argument does not apply. Evidence: verdict D24; [result](screenshots/19-found-animal-result.png).

### D25 - Amend: local text-selection changes only

Affected controls are detail-page phone/email anchors and the coverage call button. Coverage email and directory rows already select normally.

**Action:** add `select-text` on affected anchors only. For the coverage button, separately wrap the number from “Pokliči” if needed, or leave that button. No copy action and no shared `ui/button.tsx` change. Evidence: verdict D25; [contacts](screenshots/17-shelter-detail.png).

### D26 - Amend: use the upstream boundary token consistently

Inputs and outline buttons share the faint boundary. The review reports 1.256:1 light and 1.479:1 dark, versus upstream `--control-border` at 3.66:1 and 3.77:1.

**Action:** after integration, use `border-control-border` for Input, Select, and outline Button; retire `CONTROL_FRAME` where superseded. Inspect the approximately 40 affected call sites. This is not a full accessibility-conformance verdict. Evidence: verdict D26; [resting input](screenshots/18-found-animal-start.png).

### D27 - Amend: use existing paths for a distinct section state

Exact equality loses the parent cue on descendants. The menu deliberately uses supplied `paths[locale]`, not a router read.

**Action:** use equality or a guarded descendant-prefix predicate on those paths; guard root hrefs. Add a third visual state distinct from current-page and hover. Do not mark descendants `aria-current="page"`, add more duplicate page indicators, or introduce `usePathname()`. Preserve the breadcrumb's page semantics. Evidence: verdict D27; [shelter detail](screenshots/17-shelter-detail.png).

### D28 - Amend; scope decision: provenance content before linking

No usable registry URL exists. The gov.si link was deliberately removed, and the current content-policy page answers listing-permission questions only.

**Option:** first add registry provenance to `data-policy-page.tsx` from `register_date`, `last_reviewed`, and `hours_checked`; then link `text.source` to `DATA_POLICY_PATHS[locale]`. If this content is out of scope, defer/downgrade the opportunity and leave the text unlinked. Evidence: verdict D28; [source footnote](screenshots/28-shelter-onboarding.png).

### D29 - Amend; already upstream: unknown-string branch only

The field already names the expected place type and has clear/location controls. Settlements mostly resolve; `9999` already gets two-route guidance. The actual gap was a directory escape for an unknown string such as `zzzz`.

**Action:** verify the `/zavetisca` link reported in PR #253. Withdraw additional municipality-hint and reset-route recommendations. Evidence: verdict D29; [old unknown-string state](screenshots/20-found-animal-no-match.png).

### D30 - Amend: show cross-species recovery with active chips

Recovery already exists in the sticky chip row and species strip. The empty block's clear is intentionally `lg:hidden`; cross-species recovery is unnecessarily gated on `chips.length === 0`.

**Action:** remove that gate when a species is selected and other species match, with a count-bearing “Pokaži vse vrste” action. Keep clear's responsive behavior. No clear action may reset species. Verify using `ostalo`, not `ostale`. Evidence: verdict D30; [empty state](screenshots/30-empty-animal-results.png).

### D31 - Amend: disclose the Slovenian destination

The portal is Slovenian-only, without localization infrastructure. The English entry link does not signal that destination language.

**Action:** add `hrefLang="sl"` and a visible signal in the English `messages.shelterLogin` only, covering the large-screen button and dropdown. An English way back is optional. Do not localize the portal as part of this fix. Evidence: verdict D31; [English index](screenshots/25-english-home.png), [login](screenshots/24-portal-sign-in.png).

### D32 - Amend: existing tooltips already show ranges

Accessible names and hover/focus tooltips contain the age ranges. There is one ladder: under 12, 12–95, and 96+ months, not species-dependent bands.

**Option:** put ranges in the existing `ageFilterHint`. No extra second line per row and no species-specific definitions. Evidence: verdict D32; [age controls](screenshots/35-filtered-before-language.png).

### U1 - Confirmed by verdict: reset scroll on animal change

The original Lulu → Ruben test returned 0 and did not establish the defect. The review's Balta → Gulya transition from 250 retained/clamped to 222 at 1440×640, 204 at 1366×660, 105 at 1440×768, and 0 at 1440×900. The tall viewport hid retention because the next animal had no remaining scroll range.

**Action:** reset the detail card's scroll in the animal-change effect. Test long-to-long transitions at short heights alongside D02. The [original transition](screenshots/09-next-animal.png) is a negative test, not the confirming case; confirmation is attributed to the verdict.

### U2 - Confirmed by verdict; already upstream: share selected photo

The review confirmed a page showing photo 3 sharing the bare URL while the dialog shared `?foto=3`. It reports the PR #253 fix through `AnimalPagePhotoProvider`.

**Action:** verify after integration rather than reimplement. The original audit did not complete this sequence.

## Revised work order

1. **Establish the baseline.** Preserve in-flight work and integrate upstream through an appropriate separate workflow. Recheck D06, D12, D13, D29, U2 and D16/D21/D26 prerequisites. The old screenshots are not evidence against integrated fixes.
2. **Correct navigation and continuity.** D02 + U1, D03, D04 including the opening image, D05, D07.
3. **Improve interpretation and recovery.** D01, D08, D09, D10, D14, D30, D31. Preserve typed-place behavior, unknown-data semantics, and species-reset behavior.
4. **Apply bounded control fixes.** D16, D21, D25, D26, D27 on integrated components; inspect relevant call sites, languages, themes, and short heights.
5. **Evaluate optional refinements separately.** D17, D19, D20, D24, D32. Preserve the chosen design; establish measurable benefit before expanding scope.
6. **Keep product/content choices explicit.** D11 name search, D22 card facts, D28 provenance content. D15, D18, D23 are withdrawn, not deferred fixes.

## Verification conditions for later code work

- Include heights of 768px or lower for detail scrolling/keyboard behavior. A tall viewport can conceal overflow-dependent failures.
- Reproduce D05 with a filter toggle inside `SMOOTH_SCROLL_LIMIT = 2`, then test the longer-distance branch. A species tab is not equivalent evidence.
- Establish consistent `posvoji:filter-sections` storage before comparing sidebar heights, then test persisted user choices separately.
- Use slug `ostalo`; assert visible state as well as the URL.
- Identify the front print with `aria-current="true"`. Screen-reader-only photo-position text does not prove visible count placement.
- The “Uradne ure:” label is screen-reader-only; the hours value is visible. Do not conflate them.
- Resolve computed `lab()` colors correctly, such as through a canvas; an `rgba()`-only parser gives invalid contrast conclusions.
- Measure the picker separately from the found-animal map. Only the former is height-bound in the review; 1366×768 is important for its geometry.
- Exclude `nextjs-portal` development overlays from product screenshots/hit testing. They are not product defects.
- Preserve the containment guard, existing route source of truth, and species contract. Avoid duplicate current-page semantics.
- Run required repository checks and the web build for application changes. Add meaningful behavioral tests for actual defects, not tests that merely repeat presentation code.

## Corrected flow health

| Step | Flow | Health after review |
| --- | --- | --- |
| 1 | Arrive and scan | Usable; short-height spacing and explicit search/card-fact decisions remain |
| 2 | Filter and sort | Smooth-scroll interruption and energy hint need narrow fixes; nested scrolling stays |
| 3 | Choose shelters | Wrap one name and distinguish duplicate glyphs |
| 4 | Card photo → detail | Correct selected-photo handoff and opening image |
| 5 | Read/navigate details | Scroll-first keys, scroll reset, energy fact, and age-specific verification copy remain |
| 6 | Lightbox/share | Dialog lightbox worked; standalone share fix reported upstream |
| 7 | Direct page → index | Fix view-all href; standalone lightbox reported upstream, visible count unverified there |
| 8 | Shelter information/joining | Hours/on-call and email invitation reported upstream; logo layout accepted |
| 9 | Found-animal lookup | Qualify unreliable device fixes and clarify finding place; contact already leads |
| 10 | Empty/404 states | Keep good 404/shelter notices; fix cross-species gate; unknown-place recovery reported upstream |
| 11 | Language/sign-in | Render full language href and signal Slovenian portal |
| 12 | Information pages | Reading layouts healthy; section cue and optional provenance are separate concerns |
| 13 | Poster | Original screen preview only; actual printing unverified |

## Revision scope and validation

This revision changes documentation only. No application fixes, upstream integration, or fresh browser measurements were performed. The review verdict is unchanged. Historical notes/screenshots remain, but this document supersedes their recommendations.

The original four required checks passed; [logs](validation/README.md) are historical evidence for the audited tree, not validation of future fixes. This prose-only revision checks document links, stable IDs, verdict categories, and preservation of the verdict. Application checks were not repeated solely for documentation edits.
