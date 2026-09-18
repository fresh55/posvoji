# Verdict on the 2026-09-18 desktop audit

Reviewed 2026-09-18. Four read-only Opus lanes re-derived every finding from
source and re-measured it on the working-tree dev server over CDP (headless
Chrome, 1440x900 unless stated; 1366x768, 1024x768 and 1920x1080 where the
finding depends on it). Lane transcripts, scripts and screenshots: session
8dac7fbd scratchpad `verify/laneA..D/`.

Result over the 32 findings: 8 approved, 21 approved with a change, 3
disapproved. Both unverified candidates are now confirmed; one of them is a
real finding the audit itself could not see at 1440x900.

## The tree the audit measured is stale

The audited working tree is `main` at d1e8c76 plus in-flight changes, which
is 20 commits behind `origin/main` (f2b7a79). Five findings are already fixed
upstream, and several approved fixes below only apply after a rebase:

- **D06** `PhotoLightbox` is on the animal page (`animal-page-gallery.tsx`).
  Whether the count became visible was not checked.
- **D12** the detail page prints `hours` and `onCallPhone` (PR #249).
- **D13** the join invite is a mailto to the project address (PR #249).
- **D29** the no-match branch links `/zavetisca` (PR #253).
- **U2** the page share carries the chosen photo through
  `AnimalPagePhotoProvider` (PR #253).
- **D26** needs `--control-border`, which exists only upstream (PR #255).
- **D16** and **D21** sit inside the picker files PR #254 rewrote.

Everything below is stated against the audited tree, with the upstream state
noted where it differs.

## Approved (fix as described)

- **D04** Card at "Fotografija 2 od 13" opens the dialog at "1 / 13".
  `?foto=` already works end to end, so only the card-to-dialog hand-off is
  missing (`animal-card.tsx:177-192`). Upstream passes the photo's rectangle
  for the bloom but still not its index. Extra: the bloom flies `images[0]`
  (`animal-dialog.tsx:359`) on a premise the fix falsifies; fix both.
- **D07** Resting href is `/en`; `auxclick` and the context menu get `/en`,
  a left click gets `/en?vrsta=pes&energija=miren`. Query keys are locale
  independent (`lib/filters/url.ts:28-38`), so the full URL is valid (486 to
  2 animals, Dogs tab on). Extra: the click handler writes the href into the
  DOM, so a later middle-click carries a stale query. Fix: render the query
  into the href from `lib/location-search.ts` and delete `keepFilters`; the
  comment at `language-switcher.tsx:64-66` is true of prerendered HTML only.
- **D09** `animal-facts.tsx` never reads `animal.energy`. Energy is the only
  filter dimension with no fact; health, goodWith, apartment and care all
  render. Energy is on 38 of 486 animals (19 calm, 19 lively, 0 balanced).
  Note it already drives the fan's tempo (`photo-spread.tsx:94`).
- **D11** No name search: zero inputs on `/` and `/en`; only the picker's
  place search exists. Sort has "Ime A-Ž". Product gap, one self-contained
  PR (contracts, url, engine, prehydration deep link, toolbar, chips, i18n).
  Bruno's call.
- **D13** Confirmed in the audited tree: card ends "nam to sporočite na
  GitHubu", `shelters-page.tsx:27-40` concedes it. Already fixed upstream.
- **D14** `main` has zero `<label>` elements. The input has `aria-label` and
  placeholder only. The h1 asks "Si našel žival?" (whether, not where); no
  visible copy asks where, except `muniPostcodeInstead`, which renders only
  on a geolocation error. Cheapest fix: `muniPromptTitle` names the place;
  metadata reads the same key.
- **D19** First photo top is 308px at both 1440x900 (34.2%) and 1024x768
  (40.1%): header 73 + `--page-y` 48 + hero 70 + `--section-gap` 40 +
  toolbar 61 + 16. The cat costs zero flow height (PR #217); strike that
  clause. Fix: a height band beside `@media (height <= 32rem)`
  (`globals.css:187`); `--page-y: 2rem` alone gives 292, plus
  `--section-gap: 1.5rem` gives 276. The cat is positioned against
  `--section-gap`, re-check him.
- **D22** Fact confirmed and stronger than stated: `animalMetaParts`
  (`lib/labels.ts:364-403`) keeps two facts but sex is still the third-ranked
  fact, contrary to the 2026-08-31 memory. Live on Psi: Reks "starost 14 let
  · samec", Biba "starost 10 let · velika", Otis "velika · samec". Dogs: 44
  age+size, 44 age+sex, 7 size+sex, 23 one fact, 2 none. The comment at
  `:356-359` rejects fixed slots by name and placeholders would dash half the
  dog cards. Real choice: leave it, or drop sex from the card. Never a third
  fact.

## Approved with a change

- **D01** `use-nearby.ts:107-113` drops `coords.accuracy`;
  `municipality-lookup.ts:45-54` has no distance ceiling;
  `municipality-finder.tsx:350-352` auto-accepts a singleton. Offline: London
  (1148 km) Bovec, Vienna (154 km) Kuzma, Zagreb (26.9 km) Brežice, New York
  Bovec, all settled. A 5 km circle at the Ljubljana/Brezovica border spans
  5 municipalities. Change: do not make every inferred municipality a
  suggestion (ambiguity is already handled by `muniWhichOne`, and a confirm
  step taxes the typed path). Carry accuracy through, add a max distance to
  `municipalitiesNear`, demote to a suggestion only for a device fix that is
  coarse or out of range. Browser permission flow not exercised.
- **D02** Reproduced: Balta expanded, 402px unread, one PageDown opens
  Gulya. Same from inside the description. In the lightbox PageDown does
  nothing (portalled, the `contains` guard at `:495` returns). It is
  documented as deliberate (`animal-dialog.tsx:483-492`) and the audit's fix
  (labelled controls) already exists. Real fix at `:493-500`: let the card
  consume the key first, step to the sibling only when the card is at that
  end. The guard must survive.
- **D03** "Poglej vse živali (486)" lands on the byte-identical URL with
  Ruben's dialog open. The `?zival=` here is written by the page for itself,
  not the old-external-link case the comment at `:198-202` protects. Of the
  two settled options take the href: `animal-page.tsx:214` to `indexHref`.
  Keep the parsing. Still open upstream.
- **D05** Real, but the cause is the opposite of "position is preserved":
  `scrollToResults` (`use-animal-filters.ts:60-91`) does scroll back with
  `scrollTo({top:231, behavior:"smooth"})`, and ~46 ms later motion-dom's
  `measureAllKeyframes` restores the scroll it captured and cancels it.
  Confined to the smooth branch (under `SMOOTH_SCROLL_LIMIT` viewports); from
  2800 the `auto` branch lands correctly. Fix: re-assert the target after the
  results commit, or drop the smooth branch. `window.scrollTo` only, so the
  2026-09-13 scrollIntoView rejection does not apply. Do not implement the
  audit's recommendation, it is what the code already tries.
- **D06** Confirmed in the audited tree: page hero 496x372 over an 800x1067
  portrait, 56.2% visible, no enlarge control, count `sr-only`. Fix is M05's
  (lightbox plus visible count), never the fan. Lightbox already upstream.
- **D08** 3 of 120 dogs carry energy; "Uravnotežen 0" is rendered disabled
  (`filter-card.tsx:119`), not offered. The tooltip already says "Živali brez
  podatka ta filter skrije" but not the scale. Fix: one sentence carrying the
  count in `energyFilterHint` (`lib/i18n.ts:263`, `:735`), not a persistent
  block; reject the include-unknown control.
- **D10** Hierarchy fact holds: home publication 14px at y 164, dialog
  verification 12px at y 794, 31px under the CTA. But the audit's fix is
  shipped already. The real defect is wording: `sourceIsOld` fires at 30
  hours and prints one fixed string, so a 12-day-old check reads like a
  31-hour-old one. Fix `i18n.ts:47` to name the age. No phone beside one
  animal (PR #240).
- **D12** No address field in `ShelterRegistryEntry` (`shelters.ts:15-30`)
  or `shelters.yaml`, so directions are not implementable. Two corrections:
  the map is not the waste (208x155, 20.3% of the header row, capped with the
  reason at `:343-348`), leave it; and hours/on-call are not universal (10
  of 17 have `hours`, 5 have `onCallPhone`, 6 neither), so gate on presence.
  The replacement fix is already upstream.
- **D16** Stage 958 of 1344 (71.3%), panel 384, list 351 usable px. Exactly
  one of 11 rows truncates, by 22px; `lg:truncate` (`shelter-rows.tsx:351,
  456`) is deliberate. The map is height-bound, not width-bound: 21px of its
  column draws nothing at 1440x900 and 129px at 1366x768. Fix: drop the
  `max-lg:` so the name is `line-clamp-2` at every width; optionally
  `lg:w-96` to `lg:w-[26rem]`. `controller.ts:313-322` documents the split;
  no list-first layout. Rebase over PR #254 first.
- **D17** aside 939/876 at 1440x900 (Dom and Posebna skrb below the fold),
  939/744 at 1366x768 and 1024x768 (five sections below). So the audit's
  "energy, health, household out of view" is false at 1440x900, true at
  768. Reject "avoid nested scrolling" (PRs #200, #204). Only Kje's 180px
  plate and Starost's 192px body could close a 195px gap; the grove stays.
  Recommend a height-gated default collapse of Starost below ~800px only.
- **D20** Front print 200x267 in a 437x287 fan on a 614x267 stage, identical
  at 1440x900 and 1366x768 because the stage is 80% of the dialog width over
  2.3 and never grows with height. The legibility half does not hold: the
  print is the whole uncropped frame, the head reads, one click opens the
  lightbox. The fix re-litigates the chosen design. If anything: relax
  `DESKTOP_STAGE_ASPECT` on tall viewports the way the phone layout does.
- **D21** Not similar, pixel-identical: `map-legend.tsx:152-163` renders the
  same `EmptyMarkerGlyph` for both rows (r 2.295, stroke 0.7, same colour),
  and the map draws both states as the same `data-marker-empty` circle
  (`map-marker.tsx:838-885`). The key offers two identical symbols, so the
  states are indistinguishable with the legend as well as without it. Fix:
  a variant on `EmptyMarkerGlyph` passed from both places; a dashed stroke
  pairs with the dashed region boundary that already means "a filter did
  this". Not opacity (`:836-839` records it read as a control).
- **D24** Answer column 384px (31.6%), map 800px with 0px slack. Two halves
  are false: the shelter already leads (first in DOM, left column, documented
  at `found-animal-atlas.tsx:41-46`), and on-call is an equal 350x36 outline
  button above the address rows, not subdued text
  (`municipality-coverage-card.tsx:104-109` records that fix). Only the ratio
  survives; `24rem` to `28rem` at `found-animal-atlas.tsx:61` if anything.
- **D25** `select-none` on the shared Button; detail-page phone/email and the
  coverage call button select nothing, the coverage email row and all 16
  directory rows select fine. Changes: scope is detail page plus coverage
  card only; fix is `select-text` on those anchors, not a copy action; the
  coverage label is one text node "Pokliči 01 256 02 79", so span-wrap the
  number or leave that button; do not touch `ui/button.tsx`.
- **D26** Input light `#e7e5e4` on white is 1.256:1, dark 1.479:1, and the
  outline Button measures the same, so there is no input-vs-button gap. The
  upstream `--control-border` measures 3.66:1 light and 3.77:1 dark, and its
  own comment names inputs as the planned follow-up. Fix after rebase:
  `border-input` to `border-control-border` in `ui/input.tsx`, `ui/select.tsx`
  and the outline variant; retire `CONTROL_FRAME`. About 40 unmeasured call
  sites.
- **D27** `site-menu.tsx:55-61` is string equality on `paths[locale]`, no
  router read. `/zavetisca` marks Zavetišča; every child route marks nothing.
  Changes: predicate over `paths[locale]` (`path === href ||
  path.startsWith(href + "/")`, guard a root href); do not give descendants
  `aria-current="page"` (`/o-nas` already carries three); the section cue
  must be a third visual state since weight distinguishes current from hover
  (`:100-103`).
- **D28** Both footnotes render zero anchors, and no URL exists to link:
  `shelters.yaml` `meta.register_source` is a name and a date, and
  `municipality-finder.tsx:864-867` records the gov.si link was removed on
  purpose. `/o-nas/vsebine` covers listing permission only, nothing on the
  register. Fix: a registry-provenance section on `data-policy-page.tsx`
  from `register_date`, `last_reviewed`, `hours_checked`, then link
  `text.source` to `DATA_POLICY_PATHS[locale]`. If the section is out of
  scope, downgrade the finding rather than link a page that does not answer.
- **D29** "Ni občine z imenom »zzzz«" with the field's own clear and the
  location button beside it; no `/zavetisca` link on the page. Struck: "no
  hint a municipality is needed" (placeholder and aria say it), "suggest the
  municipality" and "keep a reset route" (both on screen). `9999` already
  gets the two-route message; settlements mostly resolve. Only the
  unknown-string branch is a dead end. Already fixed upstream.
- **D30** Empty block at y 344-560 with no button inside it: the clear is
  `lg:hidden` (`animal-grid.tsx:662-670`) and `showAllSpecies` is gated on
  `chips.length === 0` (`:671-680`). Recovery is the sticky chip row at y 287
  and the strip's Vse 19. Fix: drop the `chips.length === 0` gate so "Pokaži
  vse vrste (19)" is offered whenever a species is chosen and others match;
  keep the clear `lg:hidden`; no clear may touch the species (PR #235).
- **D31** English header sends "Login for shelters" to `/portal/prijava`
  with no `hreflang`; the portal has no i18n at all (0 of 49 files in
  `components/portal/`, routes only under `app/(sl)/`) and every link on the
  login page targets the Slovenian site. Fix: `hrefLang="sl"` plus a visible
  signal in the English string only (`messages.shelterLogin`), applied to the
  `lg` button and the dropdown copy at `site-menu.tsx:209-223`; optionally an
  English way out in `portal-login.tsx`. Not a reason to localise the portal.
- **D32** Accessible name "Senior, 8 let ali več, 29 živali" and a hover or
  focus tooltip "Senior · 8 let ali več" on each row
  (`age-growth-control.tsx:551-558`), so the ranges are shown, not
  persistently. The ranges are one ladder (<12, 12-95, 96+ months,
  `engine.ts:88-90`), not per species; drop that clause. A second line costs
  ~42px on the default-open section and feeds D17; the no-cost option is the
  ranges in `ageFilterHint`, which the same info mark renders.

## Disapproved

- **D15** Already handled. Accessible names are distinct, the tooltip
  renders live ("Naslednja žival", 105x28), and the photo chevrons sit inside
  the front print (626,205 and 782,205 within 620,87 to 820,354). The rest
  is PR #213's settled position. Residue if tone is wanted: the arrows sit
  10px below the fan's lowest print.
- **D18** Selected state is already identical across all seven sections
  (brand fill, brand-foreground label at 500, 40px row); the PR #204 defect
  is gone. Icon sizes are the controls' meaning (age grove 20/22/24, size
  paws 12/16/20); sex at 24 is lucide's own grid, documented at
  `sex-cards.tsx:70-76`. The recommendation re-litigates the icon-driven
  controls. Optional only: normalise the 1.7 and 1.75 strokes onto 1.65.
- **D23** Only 2 of 17 cards lack a logo (Brežice, Sia in Lu), both in row
  1 beside Mačja hiša whose mark is 44x54; the blank is ~48px on two cards,
  and the band is the subgrid row's height set by the neighbour, so it cannot
  be reclaimed without misaligning the row. The proposed fallback is the
  initial avatar the 2026-09-11 pass removed. Aside: `shelter-avatar.tsx:194`
  says six shelters lack logos; stale, the manifest resolves 15.

## Unverified candidates, now verified

- **U1 (new, real)** Scroll position is retained and clamped when moving to
  the next animal: Balta to Gulya from 250 lands at 222 (1440x640), 204
  (1366x660), 105 (1440x768), 0 at 1440x900 where Gulya's own maximum is 0,
  which is why nobody saw it. From ~768px viewport height down the next
  animal opens pinned to its own bottom. Fix: one line in the `[animal]`
  effect at `animal-dialog.tsx:345-347`.
- **U2** Page at "Fotografija 3 od 10" shares the bare URL, dialog shares
  `?foto=3`. Already fixed upstream.

## Traps recorded by the lanes

- Viewport height decides whether U1 and D02 are visible at all; 1440x900
  clamps both to a false pass. Test at 768 or lower.
- Motion's `measureAllKeyframes` overwrites any same-frame programmatic
  smooth scroll; `SMOOTH_SCROLL_LIMIT = 2` hides D05 if reproduced from more
  than two viewports down. Verify with a filter toggle, not a species tab.
- `--control-border` does not compile in the audited tree; rebase first.
- `isCurrent` in `site-menu.tsx` deliberately does not read the router
  (`:49-54`); a `usePathname()` fix introduces the second source of truth it
  refuses.
- Three `aria-current="page"` already sit on `/o-nas`; the breadcrumb owns
  "page".
- Chrome returns computed colours as `lab()`; an `rgba(` regex yields 1.0:1
  for every pair. Resolve through a canvas.
- Filter folds persist in `localStorage` (`posvoji:filter-sections`) and
  corrupt sidebar-height measurements across runs in a reused profile.
- The species slug is `ostalo`, not `ostale`; a wrong slug falls back to Vse
  and turns an empty-state test into a 19-result test.
- The front print is `aria-current="true"`, not `data-print="front"`;
  `photo-position` is `sr-only`, so text assertions pass on invisible markup.
- `Uradne ure:` is `sr-only`; the hours themselves are visible.
- The picker's map is height-bound (129px blank at 1366x768); the
  found-animal map is not. Do not carry the slack argument across.
- Picker geometry is fixed above ~1430px; 1366x768 is the only desktop
  viewport that changes anything.
- Remove `nextjs-portal` before every hit test and screenshot.
