# Windows rendering, build fonts and notifications

## Findings

The 3 September crawl log ends after the logo stage with exit 3221226356
(`0xC0000374`, Windows heap corruption), before the share-card summary. This
places the failure after logos and before share-card completion but does not
identify the native function responsible. No crash dump was available to prove a Pango/libvips
root cause. The subject detector was not involved in that run.

Current share-card drawing invokes sharp's native text renderer inside the
export process. A JavaScript catch cannot recover from a native process crash.
Windows now renders each card in a disposable child process, with a timeout
and output bound. Only a clean child exit permits its JPEG to be published;
a failed card follows the existing warning/fallback path and does not kill
the export. Linux retains its existing rendering path. This contains the
failure; it is not a claim that the native-library defect was reproduced or
fixed. Other native image-processing stages remain in the export process.

The 4 September build failed fetching Inter. All seven existing Inter subsets
are now committed locally, preserving the character ranges, weights, small
Slovenian face and fallback metrics. Normal builds no longer use
`next/font/google`. Intentional font updates remain a separate maintenance task.

The `PosvojiCrawl` Application event source was absent from this PC. It was
registered on 17 September and a normal, non-elevated notification successfully
wrote event 102. The retired Windows crawl and dead-man tasks remain disabled.
For another PC, run only `scripts/setup-crawl-event-source.ps1` once in Windows
PowerShell as administrator. A notification write failure now emits one warning
and retains exit zero; it never attempts unattended elevation or re-registers
the crawl tasks.

## Verification

- `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `pnpm validate:policies` passed.
- Real JPEG rendering, failed-child recovery, and timeout tests on Windows.
- Notification tests with successful and denied event writes, plus an actual
  Application-log write after registration.
- Static build with HTTP, HTTPS and ALL proxy settings pointing to an
  unavailable local endpoint; fonts are bundled into the output.

The provider checkpoint resume window remains two hours. This change does not
weaken source freshness, permission checks or the sealed-generation commit.
