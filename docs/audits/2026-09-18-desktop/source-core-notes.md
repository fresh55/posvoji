# Desktop core UI: source-only supporting notes

> Historical source-review candidates. The [verdict](verdict.md) subsequently confirmed both remaining candidates and narrowed several fixes. Use the [reconciled report](README.md); the recommendations and verification status below describe the original review only.

Reviewed 2026-09-18. These are candidates identified from the current source and local dataset. This review did not operate the browser or capture screenshots. Each proposed user-visible effect remains unconfirmed by this reviewer; the main audit records browser verification separately. Prior audit reports were not used as evidence.

## C1 - PageUp/PageDown navigate between animals (candidate P2)

- **Source confirmed:** `apps/web/components/animal-dialog/animal-dialog.tsx:493–499` intercepts PageUp/PageDown for events whose target is inside the dialog. When a sibling exists, it prevents the default action and navigates to that animal. The handler is attached at line 607.
- **Concern to verify:** A desktop reader expecting these keys to scroll a long description may unexpectedly change animals.
- **Reproduce:** Open an animal with a long description; expand it; keep focus inside the main dialog and press PageDown. Check whether content scrolls or the animal changes. Do not test in the separately portalled share sheet.
- **Direction:** Preserve standard scrolling or restrict animal shortcuts to an explicitly identified navigation control.

## C2 - Card photo selection is not passed into the dialog (candidate P2)

- **Source confirmed:** `apps/web/components/animal-card.tsx:134,321–322` stores and renders the card photo index. Its open call at lines 177–192 passes the animal ID and geometry without that index. `apps/web/components/animal-dialog/animal-dialog.tsx:435,686–690` initializes its gallery from the URL photo parameter.
- **Concern to verify:** Opening a card after browsing its photos may return to the first photo.
- **Reproduce:** On a normal index URL without a photo parameter, advance a multi-photo card to photo 2 or 3, then open that card. Compare the selected photo before and after opening.
- **Direction:** Carry the selected card photo into the detail view.

## C3 - Animal navigation has no explicit inner-scroll reset (candidate P2)

- **Source confirmed:** `apps/web/components/animal-dialog/animal-dialog.tsx:699–710` renders the scrollable card without an animal-specific key. The animal-change effect at lines 345–347 reads the existing scroll position to update arrow placement; it does not reset that position.
- **Concern to verify:** A newly selected animal may inherit a nonzero scroll position. Browser clamping and the next animal's content height can affect the result, so retention is not asserted as reproduced.
- **Reproduce:** Expand a long description, scroll the detail card down, then select the next animal. Check its initial inner scroll position and whether its first details are visible.
- **Direction:** Reset the detail scroll position when animal identity changes.

## C4 - Energy can filter results but has no explicit detail fact (candidate P2)

- **Source confirmed:** `apps/web/lib/filters/metadata.ts:202` defines energy options, and `apps/web/lib/filters/engine.ts:222` indexes `animal.energy`. `apps/web/components/animal-dialog/animal-facts.tsx:539–715` renders identity, requirements, health, compatibility, and home facts without reading or displaying energy. That component is used by both the modal and standalone animal page.
- **Concern to verify:** A user filtering for energy cannot find an explicit matching energy fact in detail. A shelter's prose may still describe temperament; this note does not claim that all such information is absent.
- **Reproduce:** Filter for calm or lively, then inspect an animal's detail facts. Current local data examples: Cassia (`macja-hisa:4657`, calm), Elena (`macja-hisa:4859`, calm), Gimli (`macja-hisa:4864`, lively).
- **Direction:** Display recorded energy alongside the other structured facts.

## C5 - Standalone-page share does not receive selected photo (candidate P3)

- **Source confirmed:** `apps/web/components/animal-page-gallery.tsx:48–60` keeps the chosen photo locally. `apps/web/components/animal-page.tsx:166–169` renders `ShareButton` without a photo prop. In contrast, `apps/web/components/animal-dialog/dialog-share-button.tsx:38–41` supplies the current photo.
- **Concern to verify:** Sharing after changing photos on the standalone page may open a different photo for the recipient, unlike sharing from the modal.
- **Reproduce:** Open a standalone multi-photo animal page; advance its photo; use Share and inspect the generated link. Open that link and compare its starting photo with the selected one. Compare with the modal share behavior.
- **Direction:** Share the currently selected photo consistently across the two detail presentations.

## Local examples for long-description verification

The current `data/dist/animals.json` has descriptions of 1,659 characters for Balta (`horjul:1636`), 1,010 for Gulya (`horjul:1646`), 768 for Napoleon (`horjul:5204`), and 726 for Suki (`horjul:1390`). These are test candidates, not evidence that a particular viewport will overflow.
