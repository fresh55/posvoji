# Desktop screenshot walkthrough

Captured from the audited local working tree on 18 September 2026. [Return to reconciled findings](README.md).

These are the original captures, not screenshots of the upstream fixes described in [verdict.md](verdict.md). Captions have been corrected where the verdict overturns the original interpretation. The reconciled report supplies current recommendations; an old screenshot does not establish that a reported upstream fix is missing.

The screenshots show observed product state. A screenshot alone does not establish an interaction bug; the report supplies the action sequence and confidence where relevant. The development badge in the bottom corner is not treated as a product issue. Sizes vary as noted; most screens are 1440×900.

## 1. Arrive and scan

**01 - Slovenian index, 1440×900.** Neutral photo grid and intentional icon-driven controls; substantial space above first results. The cat adds no flow height.

![Slovenian desktop animal index](screenshots/01-home-1440.png)

**25 - English index, 1440×900.** Public English layout and sign-in destination inspected.

![English desktop animal index](screenshots/25-english-home.png)

**26 - Dark homepage, 1920×1080.** Wide layout inspected; no horizontal overflow observed in this state.

![Wide dark homepage](screenshots/26-wide-dark-1920.png)

**27 - Small desktop, 1024×768.** Three-column grid remains usable; first photo row starts around y=308.

![Small desktop homepage](screenshots/27-small-desktop-1024.png)

## 2. Filter and recover

**02 - Lower filters before selecting calm.** Only three of 120 dogs have a recorded energy category; independently scrolling sidebar.

![Energy filters before narrowing the list](screenshots/02-filters-energy.png)

**03 - After selecting calm while scrolled.** Both matching photos are partially clipped above the visible results area. The verdict identifies Motion cancelling an attempted smooth scroll, not an absence of result-scroll handling.

![Narrowed results at preserved scroll position](screenshots/03-filtered-results.png)

**35 - Calm dogs at the top of results.** Reks and Biba; actual English anchor destination was `/en` without the current filters.

![Calm dogs and language-switch context](screenshots/35-filtered-before-language.png)

**30 - No animals in the selected combination.** Recovery controls exist above the generic empty message.

![Empty animal results](screenshots/30-empty-animal-results.png)

## 3. Choose shelters

**04 - Shelter picker.** One long shelter name truncates. The map is height-bound; the two empty-state legend symbols use an identical glyph. Preserve the map/list arrangement.

![Shelter picker with map and list](screenshots/04-shelter-picker.png)

**05 - Ljubljana selected.** Selection updates counts and underlying results. Immediate application is not itself classified as a bug.

![Shelter picker with Ljubljana selected](screenshots/05-shelter-selected.png)

## 4. Preserve the selected photograph

**33 - Ficko card, photo 2 of 13.** This was the selected image before opening the animal.

![Ficko card on second photograph](screenshots/33-card-second-photo.png)

**34 - Ficko dialog opens on photo 1 of 13.** Different image confirms the continuity break.

![Ficko dialog reset to first photograph](screenshots/34-dialog-resets-card-photo.png)

## 5. Read and navigate details

**06 - Šaj detail.** Photo fan, compact facts, separate animal navigation, and lower verification warning. Navigation labels/tooltips and photo-chevron placement were accepted by the verdict.

![Šaj animal detail](screenshots/06-animal-dialog.png)

**07 - PageDown changes to Lulu.** Captured after expanding Šaj's description and pressing the key.

![Lulu shown after PageDown](screenshots/07-page-down-changes-animal.png)

**08 - Lulu detail scrolled.** Used to test whether subsequent animal navigation retains the scroll position.

![Scrolled Lulu description](screenshots/08-dialog-scrolled.png)

**09 - Next animal Ruben.** This shorter detail returned to scrollTop 0 in the original test. The verdict subsequently confirmed retention with Balta → Gulya at shorter heights; this screenshot does not depict that confirming case.

![Ruben after next-animal navigation](screenshots/09-next-animal.png)

**10 - Ruben dialog at 1366×768.** Laptop-height composition, uncropped central portrait, and animal navigation at the card edge. The verdict preserves the fan and rejects the original legibility/replacement recommendation.

![Ruben dialog on laptop viewport](screenshots/10-dialog-laptop-1366.png)

**36 - Reks opened from the calm filter.** Structured facts do not show energy; fuller descriptive prose includes temperament.

![Reks detail without a structured energy fact](screenshots/36-energy-detail.png)

## 6. Inspect photos and sharing

**11 - Lightbox at 1366×768.** Original portrait is available through the modal's gallery.

![Full-screen portrait lightbox](screenshots/11-lightbox-laptop.png)

**12 - Photo overview.** Thumbnail overview worked; Escape returned to the underlying detail.

![Animal photo overview](screenshots/12-photo-overview.png)

**13 - Share menu.** Options inspected without sending or publishing anything.

![Animal share menu](screenshots/13-share-menu.png)

## 7. Direct-link detail and return path

**14 - Ruben standalone page at 1366×768.** Fixed landscape crop and reduced gallery controls in the audited tree. The verdict reports an upstream lightbox; visible count still needs verification there.

![Ruben standalone animal page](screenshots/14-standalone-animal.png)

**15 - Result of the view-all destination.** Ruben's dialog reopens over the index instead of leaving the collection unobstructed.

![Same animal reopened after view-all action](screenshots/15-view-all-reopens-dialog.png)

## 8. Shelter directory and contact

**16 - Directory.** Two cards lack logos; their approximately 48px logo band shares the neighboring card's subgrid row height. The verdict rejects reclaiming this space or restoring an avatar fallback.

![Shelter directory](screenshots/16-shelter-directory.png)

**17 - Ljubljana detail.** Contact actions and deliberately capped country map. The registry contains no address field; the corrected action is verification of upstream hours/on-call information where available.

![Ljubljana shelter detail](screenshots/17-shelter-detail.png)

**28 - Join card and registry citation.** GitHub onboarding in the old tree and nonlinked provenance text. Email onboarding is reported upstream; provenance requires appropriate content before adding a link.

![Shelter onboarding and directory footer](screenshots/28-shelter-onboarding.png)

**29 - Brežice without listings.** Helpful notice distinguishes missing index listings from actual shelter availability.

![Shelter without index listings](screenshots/29-shelter-no-listings.png)

## 9. Found-animal lookup

**18 - Starting state.** Municipality/postal input has a placeholder and accessible label. The corrected action is for the existing prompt heading to ask where the animal was found.

![Found-animal lookup initial state](screenshots/18-found-animal-start.png)

**19 - Ljubljana result.** Map beside a 384px contact column. The verdict confirms the shelter already leads and on-call is an equal outline action; only the optional width-ratio adjustment remains.

![Found-animal result for Ljubljana](screenshots/19-found-animal-result.png)

**20 - Unknown string.** The field already has clear and location controls; the missing directory escape for this branch is reported fixed upstream. Other unmatched-place branches must not be inferred from this screenshot.

![Municipality search no-match state](screenshots/20-found-animal-no-match.png)

## 10. Information pages

**21 - About.** Readable hierarchy and a clear place for the site's visual personality.

![About page](screenshots/21-about.png)

**22 - Content policy.** Readable text layout; About section cue disappears in persistent navigation.

![Content policy page](screenshots/22-content-policy.png)

**23 - Srečko.** Simple memorial layout; no separate content-specific defect established.

![Srečko page](screenshots/23-srecko.png)

## 11. Sign-in, poster, and missing route

**24 - Shelter sign-in.** Slovenian entry screen only; no email sent or authenticated flow attempted. The corrected recommendation is a language signal on English entry links, not portal localization.

![Shelter sign-in entry](screenshots/24-portal-sign-in.png)

**31 - Printable poster screen.** Browser screen preview only; physical/PDF print output was not tested.

![Animal poster screen preview](screenshots/31-poster-screen.png)

**32 - Missing route.** Useful routes back to animals and shelters.

![Not-found page](screenshots/32-not-found.png)
