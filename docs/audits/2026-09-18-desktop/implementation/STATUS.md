# Desktop audit: final disposition

19 September 2026. All approved implementation work is complete on `codex/desktop-navigation-fixes`, based on the integrated `6e94362` baseline. This accounts for all 34 entries: **21 implemented, 5 verified upstream, 2 optional layouts retained, 3 product decisions and 3 withdrawn findings**.

The table records implementation status; it does not rewrite the original review categories. [Review verdict](../verdict.md) is unchanged. [Implementation notes and checks](README.md) retain the history and verification limits. [Final browser measurements](final-browser-checks.json) record the last pass.

| Finding | Status | Result |
| --- | --- | --- |
| D01 | Implemented | Accuracy-aware device suggestions and a maximum centroid distance. |
| D02 | Implemented | Detail cards consume PageUp/PageDown before sibling navigation. |
| D03 | Implemented | Standalone view-all links lead to the bare locale index. |
| D04 | Implemented | Selected card photo reaches the dialog and opening transition. |
| D05 | Implemented | Filtering completes the return scroll without a Motion interruption. |
| D06 | Verified upstream | Ficko shows a visible photo count; opening photo 3 displays the full image with object-fit: contain. |
| D07 | Implemented | Language links include the current query before interaction. |
| D08 | Implemented | Energy help reports coverage after the other filters. |
| D09 | Implemented | Recorded energy appears in the shared animal details. |
| D10 | Implemented | Stale-source advice states the elapsed verification age. |
| D11 | Product decision | Name search remains a separate feature decision. |
| D12 | Verified upstream | Obalno shows recorded hours and on-call contact. Muri, with neither field, shows neither. |
| D13 | Verified upstream | The directory joining invitation links to mailto:info@posvoji.si. |
| D14 | Implemented | The heading asks where the animal was found. |
| D15 | Withdrawn | Keep the distinct existing photo and animal navigation controls. |
| D16 | Implemented | Shelter names allow two lines at every width. |
| D17 | Implemented | Age starts folded on short desktops; stored choices take precedence. |
| D18 | Withdrawn | Keep meaningful icon sizes and established selection states. |
| D19 | Implemented | Short desktops use tighter page spacing and a matching cat corner. |
| D20 | Retained after assessment | Retain the fan. The review confirmed its uncropped, readable image and existing lightbox; enlargement on tall screens is an optional preference. |
| D21 | Implemented | Filtered hollow map markers use the same dashed stroke as their legend. |
| D22 | Product decision | Retain the current two-fact card policy and ranking pending a product decision. |
| D23 | Withdrawn | Keep the logo subgrid; no initials/avatar fallback. |
| D24 | Retained after assessment | Retain the 24rem contact column. Both Koper call actions fit at 348px internally, the hours wrap readably, and widening would take space from the map. |
| D25 | Implemented | Shelter and coverage phone/email text can be selected locally. |
| D26 | Implemented | Input, select and outline-button primitives share the control-border token. |
| D27 | Implemented | Parent navigation sections use a dotted underline without page semantics. |
| D28 | Product decision | The proposed provenance section and authoritative registry URL require a separate content decision. |
| D29 | Verified upstream | Typing zzzz offers the shelter directory in Slovenian and English. |
| D30 | Implemented | Empty results can widen species while retaining applicable filters. |
| D31 | Implemented | The English login label identifies the Slovenian destination. |
| D32 | Implemented | The shared age-header tooltip states all three age ranges. |
| U1 | Implemented | Changing animals resets the reused detail card to its top. |
| U2 | Verified upstream | Selecting Ficko photo 3 produces a share link with foto=3; reopening it selects photo 3 after hydration. |

## Verification limits

Native geolocation permission prompts and simulated device-result layouts remain unverified in the browser. Accuracy, range limits, keyboard confirmation and recovery are covered by automated tests; the postal-centroid approximation still cannot establish exact municipal or national boundaries. See the device-location section in the implementation notes.

The control-border change is scoped to the shared input, select and outline-button primitives, not a claim of whole-site accessibility conformance. Actual poster printing remains outside this desktop implementation pass. Product decisions and withdrawn findings were not silently converted into fixes.
