# Desktop UI and UX audit - 18 September 2026

> **Superseded historical report.** Several claims and recommendations below were corrected or withdrawn by the [review verdict](verdict.md). Use the [reconciled findings and plan](README.md) for current decisions. This copy preserves the original audit, not the implementation backlog.

**32 prioritized findings: 13 substantial UX issues and 19 clarity/polish opportunities, supported by 36 desktop screenshots, interaction checks, and source review. No application changes were made.**

The neutral palette, animal photography, typography, and restrained primary buttons provide a good foundation. The main weaknesses are unexpected navigation, lost browsing context, information hidden behind filters or secondary details, and competing visual treatments in the sidebar and gallery. A more consistent shadcn-style interface would make controls quieter and more predictable while giving the animals and useful facts more space.

This is an audit of the **current local working tree**, served at `http://localhost:3000`, not a claim about the deployed website. The observed index contained 486 animals from 11 shelters; the shelter registry contained 17 entries. The index showed a publication time of 17 September 2026, 21:45 Ljubljana time. Existing staged and unstaged work was preserved.

## Reading the findings

- **P2 - substantial friction:** fix in the next UX pass; interferes with a task, causes surprising behavior, or can mislead a decision.
- **P3 - clarity and polish:** improve after the behavioral issues; affects scanning, consistency, discoverability, or visual efficiency.
- **Reproduced:** observed through interaction in the local browser.
- **Visual:** visible in captured screens; the impact and recommendation are design judgments, not measured usability outcomes.
- **Source/DOM:** supported by current implementation or rendered markup; any missing end-to-end verification is stated.

No P0/P1 outage or completely blocked public desktop journey was established. The 32 findings include improvement opportunities as well as bugs; they are not 32 broken features. Two additional unverified candidates are listed separately and excluded from this total.

## Desktop flow health

| Step | Flow | Health | Findings | Evidence |
| --- | --- | --- | --- | --- |
| 1 | Arrive and scan the animal index | Usable; too much control/decorative weight before browsing | D11, D18, D19, D22, D32 | 01, 25–27 |
| 2 | Filter and sort animals | Needs work: result position and sparse trait coverage | D05, D08, D17 | 02–03, 35 |
| 3 | Select shelters on the map | Works; list is squeezed by the map | D16, D21 | 04–05 |
| 4 | Browse card photos and open an animal | Context breaks when opening a selected photo | D04 | 33–34 |
| 5 | Read and navigate animal details | Needs work: keyboard navigation, fact visibility, freshness hierarchy | D02, D09, D10, D15, D20 | 06–10, 36 |
| 6 | Enlarge photos and inspect sharing | Lightbox/overview worked; external share completion not tested | Related D06; no separate reproduced share failure | 11–13 |
| 7 | Open a direct animal link and return to browsing | Needs work: reduced gallery and misleading return action | D03, D06 | 14–15 |
| 8 | Browse shelters, contact details, and onboarding | Usable; weak visit planning and joining path | D12, D13, D23, D25, D27, D28 | 16–17, 28–29 |
| 9 | Find the shelter for a found animal | Works for typed Ljubljana; needs clearer location confirmation and contact hierarchy | D01, D14, D24–26, D29 | 18–20 |
| 10 | Recover from empty results or a missing route | Good shelter/404 recovery; animal empty state could be more helpful | D30 | 29–30, 32 |
| 11 | Switch language and reach shelter sign-in | Public English layout usable; context and portal continuity gaps | D07, D31 | 24–25, 35 |
| 12 | Read About, content policy, and Srečko | Healthy reading layouts; shared navigation cue needs work | D27 | 21–23 |
| 13 | Open the printable animal poster | Screen preview inspected; actual print output unverified | No separate confirmed defect | 31 |

[Open the complete screenshot walkthrough](EVIDENCE.md). [Repository validation results](validation/README.md).

## Priority findings

### D01 · P2 · Geolocation can confidently select the wrong municipality

**Evidence: source plus offline reproduction; browser permission flow not exercised.** The location hook discards reported accuracy, lookup chooses the nearest Slovenian postal centroid without an outer distance or boundary check, and the finder accepts a single candidate automatically. The actual lookup function returned Bovec for London, Kuzma for Vienna, and Brežice for Zagreb. Those are lookup results, not observed browser shelter assignments.

**Impact:** an approximate or out-of-country desktop location can be presented as a settled municipality, leading toward an inappropriate contact. The animal's finding location may also differ from the user's current location.

**Recommendation:** show the inferred municipality as a suggestion requiring confirmation; retain accuracy, reject clearly out-of-area fixes, and offer manual correction before presenting responsibility as confirmed. See [source evidence and reproduction](source-secondary-notes.md#sec-01--p2--geolocation-accepts-an-approximate-municipality-as-a-settled-answer) and [found-animal screen](screenshots/19-found-animal-result.png).

### D02 · P2 · PageDown changes the animal instead of scrolling its description

**Evidence: reproduced.** Open Šaj, expand the description, focus within the dialog, and press PageDown: the dialog changes to Lulu. The animal name and URL changed. PageUp is paired with the same handler in source.

**Impact:** a familiar desktop reading key unexpectedly abandons the current animal.

**Recommendation:** preserve native PageUp/PageDown scrolling. Put previous/next animal actions on clearly labeled controls, with optional documented shortcuts that do not replace standard reading behavior. Evidence: [before](screenshots/06-animal-dialog.png), [after](screenshots/07-page-down-changes-animal.png). Source: `animal-dialog/animal-dialog.tsx:493–499`.

### D03 · P2 · “Poglej vse živali” reopens the animal the visitor is leaving

**Evidence: reproduced.** On Ruben's standalone page, the “Poglej vse živali (486)” link goes to the index with `?zival=…`. The index then opens Ruben's dialog. This is intentional in the implementation but conflicts with the visible promise to view all animals.

**Impact:** the visitor takes an extra close step to reach the collection and can feel stuck on the same animal.

**Recommendation:** make this label lead directly to the unobstructed index. If opening the animal within the finder is desirable, give that action a separate, explicit label. Evidence: [standalone](screenshots/14-standalone-animal.png), [result](screenshots/15-view-all-reopens-dialog.png). Source: `animal-page.tsx`, link using `indexHref` plus `zival`.

### D04 · P2 · Opening a card discards the selected photograph

**Evidence: reproduced.** Advance Ficko's card to photo 2 of 13, then open the animal: the dialog begins on photo 1 of 13.

**Impact:** the image that prompted the click disappears, interrupting visual comparison and forcing repeated navigation.

**Recommendation:** carry the card's photo index into the dialog and keep it consistent with any photo URL parameter. Evidence: [card photo 2](screenshots/33-card-second-photo.png), [dialog photo 1](screenshots/34-dialog-resets-card-photo.png). Source: `animal-card.tsx:177–192`, `animal-dialog/animal-dialog.tsx:435,686–690`.

### D05 · P2 · Narrowing results preserves an unhelpful page position

**Evidence: reproduced.** After scrolling down the dog results, selecting “Miren” reduced the list to Reks and Biba while leaving their photos clipped above the visible results area and a large empty region below.

**Impact:** the filter succeeds, but the resulting screen does not clearly present its new matches.

**Recommendation:** when filtering leaves the results heading or first matching row above the viewport, bring the results start into view without stealing keyboard focus. Preserve position when the relevant results remain visible. Evidence: [before filtering](screenshots/02-filters-energy.png), [after filtering](screenshots/03-filtered-results.png).

### D06 · P2 · Direct-link visitors get a weaker photo gallery

**Evidence: visual and DOM inspection.** The dialog offers an original-aspect lightbox and thumbnail overview. Ruben's standalone route instead shows a fixed landscape crop with dots and previous/next controls, without the corresponding fullscreen or overview controls in its rendered UI.

**Impact:** recipients of a direct link cannot inspect the same portrait as easily as visitors who arrive from the index. A tight crop can hide useful visual context.

**Recommendation:** share the gallery capabilities across both presentations. Keep a restrained frame, make enlargement discoverable, and let people view the complete photograph. Evidence: [standalone crop](screenshots/14-standalone-animal.png), [working lightbox](screenshots/11-lightbox-laptop.png), [overview](screenshots/12-photo-overview.png). Source: `animal-page-gallery.tsx`, `animal-page.tsx`.

### D07 · P2 · Alternate-language link destinations omit the current filters

**Evidence: source and live DOM; opening a new tab was not successfully exercised.** At `/?vrsta=pes&energija=miren`, the English anchor's actual `href` was `/en`. Query preservation is added in its click handler rather than represented in the link destination.

**Impact:** normal browser actions that use the anchor destination directly, such as copying the link or opening it through the context menu, can lose the current search context. This is not a claim that ordinary left-click switching failed.

**Recommendation:** derive the complete anchor destination from the current route and query before interaction. Evidence: [filtered state](screenshots/35-filtered-before-language.png). Source: `language-switcher.tsx:74,110,115`; [supporting notes](source-secondary-notes.md).

### D08 · P2 · Sparse trait data can look like a complete classification

**Evidence: visual.** With 120 dogs available, the energy filter offered 2 calm, 0 balanced, and 1 lively. Its explanation of incomplete information sits behind an information affordance.

**Impact:** visitors can reasonably read “0 balanced” as no suitable dogs, even though most animals have no recorded energy value. Filtering hides unknowns without making the scale of that exclusion obvious.

**Recommendation:** show a short persistent coverage note such as “Energy recorded for 3 of 120 dogs,” localized and derived from real data. Distinguish unknown from negative and consider an explicit include-unknown option. Evidence: [energy options](screenshots/02-filters-energy.png). Do not infer missing traits from descriptions without a valid normalization rule.

### D09 · P3 · A known energy match is absent from structured detail facts

**Evidence: reproduced and source-confirmed.** Reks appears under “Miren,” but his detail facts do not display energy. His expanded prose does describe a calm disposition, so the information is not wholly absent; the structured reason for matching is missing.

**Impact:** users must reread prose to verify the criterion they selected.

**Recommendation:** show recorded energy alongside the existing structured facts; omit or explicitly label unknown values consistently. Evidence: [filtered dogs](screenshots/35-filtered-before-language.png), [Reks details](screenshots/36-energy-detail.png). Source: `animal-dialog/animal-facts.tsx:539–715`, filter metadata and engine.

### D10 · P2 · Publication freshness is more prominent than animal verification freshness

**Evidence: visual.** The homepage prominently says the list was published on 17 September. Inspected animal details showed checks from 4 or 5 September, with a small warning below the shelter action. The footer explains the distinction, so this is a hierarchy issue rather than a false timestamp claim.

**Impact:** a recently published list can feel like recently verified availability, especially before a visitor reads the bottom of a detail.

**Recommendation:** keep publication and verification labels distinct, and place a concise age-of-check status beside the shelter action when verification is old. Use clear words rather than an alarming color treatment for every listing. Evidence: [homepage](screenshots/01-home-1440.png), [Šaj](screenshots/06-animal-dialog.png), [Reks](screenshots/36-energy-detail.png).

### D11 · P3 · There is no direct way to find a remembered animal by name

**Evidence: visible capability gap.** The 486-animal index provides category filters and sorting but no animal-name search.

**Impact:** a returning visitor who remembers “Ruben” or “Ficko” must browse or know the direct URL. This is a product improvement opportunity, not a broken promised feature.

**Recommendation:** add one compact, clearly labeled name search within the results toolbar, with suitable empty-state guidance. Avoid adding another large sidebar section. Evidence: [index](screenshots/01-home-1440.png), [English index](screenshots/25-english-home.png).

### D12 · P2 · Shelter details do little to support planning a visit

**Evidence: visual and DOM inspection.** The Ljubljana detail provides telephone, email, and website actions, but its map is a country overview marker; no street address or directions action is presented in the inspected detail.

**Impact:** someone deciding how to visit must leave the page and locate practical information again. A country map uses space without answering the visit-planning question.

**Recommendation:** if reliable public shelter data exists, show the actual address and a directions link near contact details, with any appointment instruction. When it does not, provide a clear “Check visiting details with the shelter” action instead of guessing. Evidence: [Ljubljana detail](screenshots/17-shelter-detail.png).

### D13 · P2 · Shelter onboarding makes GitHub the main route to join

**Evidence: visible copy and destination.** The “Ste zavetišče?” card explains the need for a recognized email, then directs a new shelter to GitHub. The project email exists elsewhere, but is not offered as the primary route in this card.

**Impact:** nontechnical shelter staff face an unrelated service and account workflow before they can participate.

**Recommendation:** make the existing project contact or a short dedicated onboarding form the primary action. Keep GitHub as an optional technical route. Evidence: [onboarding card](screenshots/28-shelter-onboarding.png). Source: `shelters-page.tsx:40,59–61,81–83`, `shelters-atlas.tsx:274`.

### D14 · P2 · The found-animal field does not clearly ask where the animal was found

**Evidence: visual.** The field uses “Občina ali pošta” as placeholder text and offers “Moja lokacija,” without a persistent field label explicitly identifying the animal's finding location.

**Impact:** users can enter their home municipality or accept their current location even when it differs from the relevant place. Placeholder-only context also disappears once typing begins.

**Recommendation:** add a persistent label, “Kje si našel žival?”, and a short instruction that current location should be used only when it is the finding location. Keep the helper concise. Evidence: [initial lookup](screenshots/18-found-animal-start.png), [selected municipality](screenshots/19-found-animal-result.png).

### D15 · P3 · Two kinds of next/previous controls compete in animal details

**Evidence: visual.** Photo navigation and animal navigation both use arrow controls. The next-animal arrow sits on the outer edge near the close control, while photo arrows belong to the gallery above. Accessible names distinguish them; the visible presentation requires interpretation.

**Impact:** a visitor seeking another photograph can move to a different animal, or hesitate over the control's scope.

**Recommendation:** keep photo controls inside the image frame and give animal navigation visible contextual labels, such as “Next animal,” in a separate position. Evidence: [detail](screenshots/06-animal-dialog.png), [laptop detail](screenshots/10-dialog-laptop-1366.png).

### D16 · P2 · The shelter picker gives the map too much space and the names too little

**Evidence: visual.** Roughly 70% of the picker is map area. The narrow scrolling list truncates a real shelter name, “Obalno zavetišče (Marjetica K…”.

**Impact:** comparing and selecting known shelters is harder than it needs to be, despite the ample desktop dialog width.

**Recommendation:** give the list at least 360–420 usable pixels plus padding, allow long names to wrap, and reduce map width or detail. Preserve map/list synchronization. Evidence: [picker](screenshots/04-shelter-picker.png), [selection](screenshots/05-shelter-selected.png).

### D17 · P3 · The desktop filters form a second long scrolling surface

**Evidence: visual and interaction.** The left sidebar has its own scrollbar while the document also scrolls. Large early filter sections push energy, health, and household criteria out of initial view.

**Impact:** visitors must manage two vertical positions and can overlook useful filters or lose the relationship between an option and its results.

**Recommendation:** reduce sidebar content height first. Use compact, consistent accordion sections and ensure the result summary stays easy to reach; avoid independently scrolling large nested regions unless necessary. Evidence: [home](screenshots/01-home-1440.png), [lower filters](screenshots/02-filters-energy.png), [1024-wide desktop](screenshots/27-small-desktop-1024.png).

### D18 · P3 · Filter decoration competes with the actual selection controls

**Evidence: visual design judgment.** The sidebar combines a map illustration, large gender symbols, a plant growth illustration, repeated age-row icons, and smaller line icons elsewhere. Their differing scale and visual weight produce several control languages in a narrow column.

**Impact:** functional choices receive less immediate attention, and the interface feels busier than its neutral palette suggests.

**Recommendation:** use one compact selection pattern, one icon size/stroke family, and one clear selected state. Keep personality in the mascot and photography; remove duplicated illustration from repetitive filter controls. Evidence: [home](screenshots/01-home-1440.png), [small desktop](screenshots/27-small-desktop-1024.png).

### D19 · P3 · The first animals start too low on a short desktop viewport

**Evidence: visual design judgment.** On the 1024×768 capture the first photos begin around y=308. Header, hero spacing, mascot area, and results controls consume approximately 40% of the initial viewport.

**Impact:** a visitor comes to browse animals but sees only one complete row before scrolling on a small laptop.

**Recommendation:** tighten hero padding and the gap before results at short desktop heights, while preserving a clear heading and the mascot's identity. Evidence: [1024×768](screenshots/27-small-desktop-1024.png), [1440×900](screenshots/01-home-1440.png).

### D20 · P3 · The photo fan prioritizes presentation over image inspection

**Evidence: visual design judgment.** The layered, rotated fan leaves the central portrait relatively small while cropped neighboring photos occupy the surrounding space. The strongest animal image could be more prominent within the same footprint.

**Impact:** people need another interaction to inspect what could have been legible immediately; the decorative gallery is visually more complex than the rest of the interface.

**Recommendation:** consider a stable main image with a quiet count and optional thumbnail strip. Preserve original aspect ratio and the existing lightbox. Evidence: [Ruben](screenshots/10-dialog-laptop-1366.png), [Reks](screenshots/36-energy-detail.png).

### D21 · P3 · Two map legend states are difficult to distinguish at a glance

**Evidence: visual.** The picker legend uses very similar outlined circular symbols for shelters with no publications and shelters with no matches for current filters.

**Impact:** users must read the legend repeatedly to distinguish unavailable data from a filter outcome.

**Recommendation:** give these states distinct shape/fill treatments and retain text explanations. Do not rely only on small differences in gray. Evidence: [map legend](screenshots/04-shelter-picker.png).

### D22 · P3 · Animal-card metadata does not occupy consistent semantic slots

**Evidence: visual.** Cards alternate between age + sex, age + size, and size + sex depending on available fields. For example, the filtered cards show Reks's age/sex and Biba's age/size.

**Impact:** comparing the same attribute across a row requires rereading rather than scanning a predictable location.

**Recommendation:** define a consistent order and visual grouping for age, sex, and size. Handle unknowns with a quiet, consistent omission or placeholder policy; do not invent values. Evidence: [mixed dog cards](screenshots/02-filters-energy.png), [Reks and Biba](screenshots/35-filtered-before-language.png).

### D23 · P3 · Missing shelter logos leave conspicuous empty card space

**Evidence: visual.** Directory cards reserve substantial logo space even when entries such as Brežice and Sia have no logo.

**Impact:** the grid appears incomplete and wastes space that could make names, places, and availability easier to scan.

**Recommendation:** use a compact neutral fallback or a layout that does not depend on every shelter having artwork. Keep card heights and text alignment coherent without giant blank placeholders. Evidence: [directory](screenshots/16-shelter-directory.png).

### D24 · P3 · The found-animal map outweighs the useful contact result

**Evidence: visual design judgment.** After choosing Ljubljana, most horizontal space remains allocated to the map, while the responsible-shelter card is narrow. Hours and emergency contact information wrap into subdued text below the main call action.

**Impact:** the map stays visually dominant after the primary question has been answered, while time-sensitive contact instructions require closer reading.

**Recommendation:** make the selected shelter and relevant contact instructions the leading result. Give the contact column more width and use the map as supporting context. Evidence: [Ljubljana result](screenshots/19-found-animal-result.png).

### D25 · P3 · Contact buttons are awkward to copy on desktop

**Evidence: source and live DOM.** The phone anchors inherit `user-select: none` from the shared Button. The visible number therefore is not normally selectable as text, and no dedicated copy action is presented in the inspected contact block. Calling through the operating system was not attempted.

**Impact:** desktop visitors wanting to call from another device must manually transcribe the number or use less obvious browser actions.

**Recommendation:** provide selectable contact text or a small, labeled copy action with feedback while retaining the call/email links. Evidence: [shelter](screenshots/17-shelter-detail.png), [found-animal contact](screenshots/19-found-animal-result.png). Source: `ui/button.tsx:28`, `shelter-detail-page.tsx:101`, `municipality-coverage-card.tsx:113`.

### D26 · P3 · Resting input outlines are too faint

**Evidence: visual plus token calculation.** The light input boundary uses `oklch(0.923 0.003 48.717)`, approximately 1.26:1 against white. The unfocused field blends into the page; its stronger focus ring helps only after the field is reached.

**Impact:** minimal styling makes the control harder to distinguish from decorative rules.

**Recommendation:** separate control-boundary styling from subtle separators and increase the resting boundary contrast. Verify at enlarged text/zoom before assigning any accessibility conformance verdict. This is not a claim about body-text contrast or a complete WCAG audit. Evidence: [neutral input outline while the location button has focus](screenshots/18-found-animal-start.png). Source: `globals.css:466`, `ui/input.tsx:18`.

### D27 · P3 · The header loses its active-section cue on child pages

**Evidence: source and live DOM.** On `/zavetisca/ljubljana`, the shelter navigation link is no longer current; the same exact-route logic affects About subpages. Breadcrumbs still provide context.

**Impact:** the persistent navigation stops communicating section membership as visitors move deeper.

**Recommendation:** distinguish current page from current section and retain a subtle parent-section indicator on descendants, with appropriate accessible semantics. Evidence: [shelter detail](screenshots/17-shelter-detail.png), [content policy](screenshots/22-content-policy.png). Source: `site-menu.tsx:55–60,104–123`.

### D28 · P3 · The registry source is named but not linked

**Evidence: visible markup and DOM.** Shelter directory/detail footnotes print the UVHVVR / gov.si source as plain text. Visitors cannot follow the citation from that footnote.

**Impact:** checking the origin or freshness of shelter information requires an independent search.

**Recommendation:** turn the citation into a link to the verified source or a maintained local provenance record. Verify the URL when implementing. Evidence: [directory footer](screenshots/28-shelter-onboarding.png), [shelter with no listings](screenshots/29-shelter-no-listings.png). Source: `shelters-page.tsx:353`, `shelter-detail-page.tsx:394`.

### D29 · P3 · A municipality no-match gives little help recovering

**Evidence: reproduced.** Entering `zzzz` produces a small “Ni občine z imenom …” message while leaving the general map and instructions in place.

**Impact:** the error identifies failure but does not help someone who entered a settlement, postcode, or alternative place name understand the next useful step.

**Recommendation:** suggest trying the municipality or postal place, give a short valid example, and keep a clear reset/manual-selection route beside the message. Evidence: [no-match state](screenshots/20-found-animal-no-match.png).

### D30 · P3 · The empty animal state does not offer its own recovery action

**Evidence: reproduced.** Calm + Other yields zero results; the page says to try fewer filters while the category controls show 19 matches across other species. Clear/remove-filter controls do exist above the message.

**Impact:** users must translate a generic instruction into an action elsewhere on the screen despite an obvious available recovery.

**Recommendation:** place a contextual action in the empty state, such as removing the conflicting filter or showing the matching animals in other categories, with counts derived from current state. Do not silently broaden the search. Evidence: [empty animal results](screenshots/30-empty-animal-results.png).

### D31 · P3 · The English journey switches abruptly to Slovenian sign-in

**Evidence: inspected English link destination and Slovenian sign-in screen.** The English header points to `/portal/prijava`; the inspected login card is Slovenian and has no language switcher. Authentication was not submitted.

**Impact:** an English-speaking visitor loses language continuity at a functional step.

**Recommendation:** provide the corresponding localized sign-in or clearly signal the destination's language and preserve a path back to the English site. Evidence: [English header](screenshots/25-english-home.png), [sign-in](screenshots/24-portal-sign-in.png).

### D32 · P3 · Age-band definitions are not visible in the normal controls

**Evidence: visual and DOM.** The age choices visibly say puppy/adult/senior, while their accessible names contain numeric ranges; for dogs these were under 1, 1–8, and 8+. The numeric definitions are not shown persistently beside the visible choices.

**Impact:** sighted users must guess the product's cutoffs when applying an age category.

**Recommendation:** place the relevant short range beside each label, updating for species as the product rules require. This can replace some decorative content rather than adding another explanation block. Evidence: [age controls](screenshots/01-home-1440.png), [filtered controls](screenshots/35-filtered-before-language.png).

## Recommended order of work

1. **Correct unexpected behavior and preserve context:** D02–D07. Confirm D01 with simulated approximate and out-of-country browser positions, then fix its inference/confirmation behavior.
2. **Make decisions easier:** trait coverage and matching facts, verification freshness, visit details, shelter onboarding, and the found-location prompt: D08–D10, D12–D14.
3. **Simplify the desktop composition:** reduce duplicate filter decoration, improve picker proportions, separate photo and animal navigation, and give the main image more space: D15–D24, D32.
4. **Finish consistency and recovery:** D11, D25–D31. Keep changes small and coherent with the current neutral design.

Use the existing shadcn primitives consistently: compact accordions for filter groups, clearly labeled selection controls, one restrained badge language, coherent control heights and icon sizes, and visible focus/boundary states. More components or more borders alone will not solve the hierarchy problems.

## What to preserve

- Photography leads the index; the neutral palette gives animals appropriate emphasis.
- Heading/body typography and the general spacing rhythm are coherent on the informational pages.
- Filter counts and removable active chips are useful and respond to selections.
- The tested lightbox and thumbnail overview worked, including Escape returning to the underlying detail.
- The no-listings shelter page explicitly explains that missing listings do not establish that the shelter has no animals.
- The tested 404 supplies useful routes back into the site.
- The 1024-wide layout remained usable; the inspected 1920-wide dark homepage had no observed horizontal overflow. These observations do not establish every breakpoint or dark-mode route as fault-free.
- The mascot and Srečko page provide identity; simplification should preserve that personality while keeping repetitive controls functional.

## Unverified candidates - excluded from the 32 findings

1. **Detail scroll position after moving to another animal.** Source lacks an explicit identity-change reset. The tested Lulu → Ruben transition ended at scrollTop 0, so retention was not reproduced. Retest between two sufficiently long expanded descriptions before filing a defect.
2. **Standalone sharing after changing the photograph.** Source keeps the standalone photo choice locally and does not pass it to the share control, unlike the dialog. The generated link and recipient result were not exercised. Verify that sequence before treating it as a confirmed sharing issue.

See [core source-review notes](source-core-notes.md) and [secondary source-review notes](source-secondary-notes.md). Line references describe the audited working tree and may move after edits.

## Coverage, limitations, and validation

Inspected Chromium-based in-app browser screens at **1440×900**, **1366×768**, **1024×768**, and **1920×1080**. Main flows were reviewed in light mode; the wide homepage was also inspected in dark mode. Public Slovenian routes, the English index, animal dialog/direct page/lightbox, filters, shelter map/directory/details, found-animal success/no-match, About/content policy/Srečko, sign-in entry, poster screen preview, and 404 were included. Screenshots were captured before recording visual findings.

This was not a full cross-browser, screen-reader, zoom, performance, or accessibility conformance audit. Safari/Firefox, every locale/route/theme combination, authenticated shelter management, real email delivery, external share completion, operating-system phone handlers, actual printing, and live geolocation permission/results remain untested. The language new-tab interaction could not be completed with the browser control; its finding is based on source and the observed anchor destination. No external provider websites were scraped or forms submitted.

All four required repository checks passed: typecheck, lint, tests, and policy validation. Lint retains an existing unused `CARDS_PER_CLICK` warning. Tests: 3,562 Node tests; portal 348 passed and 4 skipped. Policy validation: 16 valid, 0 invalid, 13 enabled. Full logs are in [validation](validation/README.md). Because this task added audit documentation and screenshots only, a web build was not required or run.

The report records the issues found within this coverage; it does not claim that no additional desktop issues exist. No fixes, commits, deployments, or application-source edits were performed.
