# Interactive cat hardening

This pass keeps the revision 19 model, textures, camera and lighting. It changes
the browser controller and adds repeatable interaction and appearance checks.

## Runtime changes

- Pointer-down records the contact without picking the skinned mesh. An immediate
  orbit or scroll drag performs no application mesh picks. A released tap picks
  once; labelled head, chin, back and tail touches use that result directly.
  Only an unlabelled body tap needs a second lookup for its model-space side.
- A stationary 420 ms hold picks once and reuses its result. Only head/chin holds
  reserve camera controls. Cancellation, outside release, window blur, multiple
  contacts, visibility changes and disposal restore those controls.
- Repeated input still coalesces into one follow-up and never restarts an active
  response. A queued back touch is now counted once, including when it waits for
  an automatic wash to finish.
- Pointer movement stores gaze coordinates without reading layout. Active gaze
  reads them at most once per 33 ms tick, eases by elapsed time, and only writes
  animation weights when they change. Settled layers stop receiving updates.
- One inactivity timer checks the latest activity deadline. Sleep requires all
  three transition clips. Pausing removes gaze layers immediately; disposal
  clears timers and listeners and pauses playback. Errors also stop interaction.

## Measurements and limits

Local measurements used isolated headless Chrome against the development site:
1280 × 900 at DPR 2, plus a 390 × 844/DPR 3 configuration with 4× CPU throttling.
They are browser emulation on the host GPU, not measurements from physical phones.
Frame timings below are requestAnimationFrame intervals, not GPU render timings.

| Measurement | Before | After |
| --- | --- | --- |
| Layout reads during 2.5 s of continuously moving the pointer, before dwell | 301 | 0 |
| Animation-layer writes during a 3 s stationary gaze sample | 160 | 27 |
| Desktop idle/gaze frame interval, 95th percentile | 8.4 ms | 8.4 ms |
| Application mesh picks for an immediate drag | On press | 0 |
| Application mesh picks for a labelled anatomical tap | Two lookups | 1 |

Neither stationary gaze sample recorded a long task. This is evidence of less
controller work, not a claim that every device renders at 120 fps.

Mesh picking remains the main measured input cost. The initial forced-lookup
profile averaged roughly 26 ms per lookup on desktop and 113–123 ms with 4× CPU
throttling. The later profile still showed expensive lookups and tap handlers
above 100 ms under throttling. This pass avoids unnecessary lookups; it does not
make model-viewer's underlying skinned-mesh picking inexpensive. Unlabelled body
taps still do two lookups, and a settled mouse dwell does one. Further work here
should evaluate an animated low-detail picking mesh against anatomical accuracy.

The initial shadow-disabled comparison did not establish a steady-frame gain,
so the reviewed lighting and shadow quality are retained. Physical Android/iOS
frame pacing, GPU load, battery use and thermal behaviour still need device
testing before making mobile performance guarantees.

## Lifetime checks

Eight real about-page/home-page navigation cycles each loaded one renderer scene,
24 geometries and 23 textures. These counts did not increase across visits.
The site uses full document navigation: the home page had no model-viewer and no
old document renderer reference. Sampled home-page JavaScript heap after garbage
collection did not grow between the third and eighth visits. This checks resource
counts and JavaScript heap, not GPU memory in bytes or a long physical-device soak.

Chromium emitted `Transition was skipped` notifications during some cross-document
CSS view transitions. Those are recorded separately from unexpected page errors;
they are not evidence of a cat resource leak. Unit tests additionally verify
in-document controller disposal, timer removal and camera restoration.

## Repeatable checks

The local September 2026 run passed all 13 browser tests; two mobile copies of
the desktop-only screenshot test were intentionally skipped. All eight desktop
pose comparisons passed. The eight-visit lifetime check passed its resource
assertions and recorded no unexpected page errors.

Repository typecheck, lint, tests and provider-policy validation passed. The first
production build compiled and passed TypeScript, then a Windows page-generation
worker exited with code 3221226505. An unchanged `pnpm --filter web build` retry
completed successfully, including all 2,067 static pages and output cleanup.

From the repository root, run:

```sh
pnpm --filter web test:e2e:cat
```

The dedicated suite uses desktop Chromium, Pixel 7 Chromium emulation and iPhone
14 WebKit emulation. Set `CAT_TEST_URL` to use an already-running site; otherwise
it uses the repository's Playwright server configuration.

It covers native anatomical taps, rapid queued input, zero-pick drags, held-touch
cancellation, multiple contacts, offscreen pause/resume, reduced motion and the
sleep/wake chain. Sleep tests advance the clock and seek transition endpoints;
they validate state handling without waiting 45 seconds per browser. Synthetic
pointer events exercise cancellation separately from the native tap checks.

Eight fixed desktop poses protect the reviewed appearance: Companion, Slow blink,
Face wash, Back warning, Head pet, Sleep, Stretch and Playful reach left. These
screenshots are regression references, not substitutes for geometric collision
testing or comparison with the original cat photographs. Mobile projects skip
the desktop-only screenshot test and run the behavioural checks.

For an intentional visual change, regenerate and inspect every changed image:

```sh
pnpm --filter web test:e2e:cat --project=cat-desktop --update-snapshots
```

Never accept new baselines merely to hide a failing comparison. The broader
repository type, lint, unit, policy and production-build checks remain required
through `pnpm check`.
