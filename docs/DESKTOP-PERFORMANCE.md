# Desktop performance pass — 20 September 2026

Implemented on `codex/desktop-performance` in separate conventional commits.

| Document-referenced assets, gzip level 6 | Saved baseline export | Current export |
| --- | ---: | ---: |
| JavaScript | 385,940 B | 343,317 B |
| HTML | 114,307 B | 105,512 B |
| Initial script files | 23 | 20 |

This compares the saved source-mapped export with the new export. It excludes
idle-loaded chunks, images and fonts; it is not a repeat of the original
818 KB full-network measurement. Baseline image requests returned 404 during
the new timing run, so its timings and total transferred bytes are unsuitable
for an apples-to-apples comparison.

The current export's separate three-run desktop profile (1440×900, 10 Mbps,
40 ms RTT, 1× CPU) measured median FCP 364 ms, LCP 696 ms, load 708 ms,
CLS 0 and TBT 0. This does not establish a latency improvement over the earlier
audit. Local profiles and screenshots are in ignored `outputs/perf/`.

Changes:

- Gallery blur follows hover and keyboard focus; hidden chevrons have no backdrop filter.
- Latin and Slovenian fonts have matching, hashed preload URLs from next/font/local.
- Dialog source URLs and verification dates travel with deferred descriptions.
  The original description-only endpoint remains available for already-open tabs.
  While loading or offline, the CTA links to the server-rendered animal page.
- The homepage no longer serializes municipality coverage. The lazy map receives
  precomputed region coverage names, regenerated before dev/build.
- The mobile drawer waits for a mobile viewport. Postal search warms when the
  location picker opens. Cat interaction code loads with the model viewer.
- The selected language catalogue crosses the server boundary once. Pure label
  formatters and error boundaries retain only their small shared vocabulary.
- Mini-map paths and exact region membership for every supported town are
  precomputed; full geometry remains in the deferred map. Selection and density
  still use the same calculations as the full map.
- Descriptions warm on grid pointer entry, focus or touch, and on dialog demand.

Validation:

- `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm validate:policies` and
  `pnpm --filter web build` passed. The final picker/map refinement also passed
  181 targeted tests; the full portal suite passed 371 tests with 4 skips.
- Chrome verified zero idle description requests, both font preloads, no resting
  chevron blur, deferred dialog source/text, postal selection, and the English
  mobile filter drawer. No browser errors appeared in those interaction checks.

Host follow-up: authenticated production responses have no Cache-Control on
sampled /_next/static JavaScript, CSS or fonts. Compression works (zstd).
Apply the immutable policy in [DEPLOY-HEADERS.md](DEPLOY-HEADERS.md) on the host;
this pass made no production configuration changes.

Cleanup: the source-mapped worktree was unregistered, but some scratch files
remain. Automatic approval review blocked their final deletion ("blocked by
policy"). The original performance harness remains in its scratchpad.
