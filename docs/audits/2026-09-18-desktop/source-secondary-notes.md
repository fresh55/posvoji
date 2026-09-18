# Desktop audit - supporting source review

> Historical source review. The [verdict](verdict.md) corrects or narrows these recommendations, including location confirmation, contact text selection, navigation semantics, and provenance. Use the [reconciled report](README.md) for current decisions.

Reviewed 2026-09-18 against the current working tree. Scope: secondary public pages, shared navigation, language switching, found-animal lookup, and shared shadcn controls. This is supporting evidence for the screenshot audit, not a claim that these issues were visually reproduced. Existing audit documents were not used as evidence. No application files were changed.

## Findings

### SEC-01 · P2 · Geolocation accepts an approximate municipality as a settled answer

**Confidence: high for the source behavior and offline reproduction; browser geolocation flow not reproduced.**

`useNearby` retains latitude/longitude but discards browser-reported accuracy. `municipalitiesNear` selects the closest Slovenian postal centroid with no distance, country, or municipal-boundary check. The finder automatically accepts a singleton result. A user with a coarse desktop location fix, or a user outside Slovenia, can therefore receive a specific municipality and shelter without confirming the place where the animal was found. A correct shelter assignment for the inferred municipality does not establish that the inferred municipality is correct.

Source:

- [use-nearby.ts:106](../../../apps/web/hooks/use-nearby.ts#L106): geolocation callback; line 112 retains coordinates only.
- [municipality-lookup.ts:45](../../../apps/web/lib/municipality-lookup.ts#L45): nearest-centroid lookup without a maximum distance.
- [municipality-finder.tsx:350](../../../apps/web/components/filters/municipality-finder.tsx#L350): automatically accepts one candidate; lines 744–747 describe the result as a responsible shelter when coverage exists.

Offline reproduction used the actual exported `municipalitiesNear` function, not a reimplementation:

| Coordinates supplied | Returned postal district | Returned municipality |
| --- | --- | --- |
| London, 51.5074 / -0.1278 | 5224 Srpenica | Bovec |
| Vienna, 48.2082 / 16.3738 | 9263 Kuzma | Kuzma |
| Zagreb, 45.815 / 15.9819 | 8257 Dobova | Brežice |

Recommended change: ask the user to confirm the inferred municipality before presenting responsibility; retain accuracy and distinguish an approximate location from a confirmed place. Reject clearly out-of-area fixes. Browser follow-up: supply an outside-Slovenia location and a coarse fix near a municipal boundary, press “Use my location”, and inspect the resulting municipality, copy, and call action.

### SEC-02 · P2 · Joining as a shelter routes through GitHub

**Confidence: high; destination and visible copy are explicit in current source.**

The directory's “Ste zavetišče?” card explains that login only works for an address already held, then sends an unregistered shelter to a GitHub issue. That adds an unrelated service and account workflow at the exact point where the shelter wants to contact the project. The site already exposes a direct project email on its About page and footer.

Source: [shelters-page.tsx:40](../../../apps/web/components/shelters-page.tsx#L40), invitation copy at lines 59–61 / 81–83, and [shelters-atlas.tsx:274](../../../apps/web/components/shelters-atlas.tsx#L274).

Recommended change: make the existing project email or a short dedicated onboarding form the primary action; keep GitHub as an optional technical route. Browser follow-up: scroll to the final directory card and follow the join destination without submitting anything.

### SEC-03 · P2 · Opening the alternate language in a new tab can lose context

**Confidence: high from event handling; browser reproduction pending.**

The language anchor initially contains only its route. Its query string is added by `onClick`, so a context-menu “Open link in new tab” or middle-click that bypasses that handler uses the bare route. Animal filters or a selected found-animal municipality are then lost in the translated tab. A previously clicked anchor can also retain an earlier query until clicked again.

Source: [language-switcher.tsx:74](../../../apps/web/components/language-switcher.tsx#L74), anchor `href` at line 110 and `onClick` at line 115.

Recommended change: derive the actual anchor destination from the subscribed current query so all standard browser link actions receive the same URL. Browser follow-up: set a non-default filter or use `/najdena-zival?kraj=Ljubljana`, open EN with the context menu and middle button, and compare the resulting query with normal left-click.

### SEC-04 · P2 · Resting input boundaries are extremely faint

**Confidence: high for token contrast; visual severity should be judged from screenshots.**

The light input border is the same token as decorative separators, `oklch(0.923 0.003 48.717)`. Against the white input/page ground it is approximately **1.26:1**. `Input` uses this border with a transparent light background, so the found-animal field depends on a very weak outline to communicate its full boundary. The stronger focus ring appears only after the user reaches the field.

Source: [globals.css:466](../../../apps/web/app/globals.css#L466), [ui/input.tsx:18](../../../apps/web/components/ui/input.tsx#L18), and the finder input at [municipality-finder.tsx:479](../../../apps/web/components/filters/municipality-finder.tsx#L479). Contrast was calculated from the actual OKLCH input token converted to linear sRGB luminance against white; this is not a screenshot sample.

Recommended change: separate the input-boundary token from quiet decorative rules and increase control boundary contrast, preserving the minimal palette. Browser follow-up: inspect the unfocused field in light mode at 100% and 200% zoom and compare it with surrounding separators. Do not generalize this finding to body-text contrast; that uses a different token.

### SEC-05 · P3 · Desktop contact buttons prevent selecting their phone/email text

**Confidence: high for CSS; practical impact depends on the desktop's telephone integration.**

The shared Button sets `select-none`. Shelter detail phone/email controls and the prominent found-animal phone controls use that Button as an anchor, without overriding text selection. A desktop visitor who wants to copy the number for another device cannot select its visible text normally. Opening a `tel:` handler is not a complete fallback for desktops without telephone integration.

Source: [ui/button.tsx:28](../../../apps/web/components/ui/button.tsx#L28), [shelter-detail-page.tsx:101](../../../apps/web/components/shelter-detail-page.tsx#L101), and [municipality-coverage-card.tsx:113](../../../apps/web/components/municipality-coverage-card.tsx#L113).

Recommended change: provide a compact copy action beside contact details or a separately selectable number/address; keep the primary call action. Browser follow-up: attempt to select the phone number in a shelter's detail contact button and in the found-animal result card, without actually placing a call.

### SEC-06 · P3 · Parent navigation stops indicating the active section on detail pages

**Confidence: high from exact route comparison; screenshots should establish prominence.**

`isCurrent` only compares exact route strings. On a shelter detail page no desktop “Zavetišča” link is active; the same happens to “O nas” on the content-policy and Srečko subpages. Breadcrumbs provide context, but the persistent navigation loses the section cue as the user goes deeper.

Source: [site-menu.tsx:55](../../../apps/web/components/site-menu.tsx#L55), especially the equality at line 60; the visible weight and `aria-current` are assigned at lines 104–123.

Recommended change: distinguish the current page from the current section; retain a visual section cue for descendant routes and use appropriate accessible current-state semantics. Browser follow-up: compare the header on `/zavetisca` and a shelter detail, then `/o-nas` and `/o-nas/vsebine`.

### SEC-07 · P3 · Registry provenance names a source that cannot be opened

**Confidence: high from rendered markup.**

The shelter directory and shelter-detail footnotes print “UVHVVR … (gov.si)” as plain text. Visitors checking the origin or age of a contact cannot follow that citation from the page. This is particularly noticeable because map attributions and found-animal citations elsewhere are links.

Source: [shelters-page.tsx:353](../../../apps/web/components/shelters-page.tsx#L353) and [shelter-detail-page.tsx:394](../../../apps/web/components/shelter-detail-page.tsx#L394).

Recommended change: link the provenance text to a verified registry source or locally documented source record; do not invent a registry URL. Browser follow-up: inspect the directory/detail source footnote and compare with the linked map credit.

## Scope and verification limits

- The pure location lookup was exercised offline using current application code. No external requests were made.
- These notes distinguish source evidence from visual/browser confirmation. Incorporate an issue into the primary visual report only with the appropriate confidence and evidence label.
- Source review did not establish additional actionable defects on the memorial or content-policy content itself. The Resources routes are deliberately unlisted in the current navigation; their existence alone is not counted as a defect.
- No fixes, test changes, commits, or application-file changes were made by this supporting reviewer. Repository-wide checks are being coordinated by the main audit agent.
