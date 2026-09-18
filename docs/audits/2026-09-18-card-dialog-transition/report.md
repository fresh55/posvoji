# Card to dialog transition audit, 2026-09-18

Read-only audit of what happens between a click on an animal card and the
open dialog, measured on the built export in `apps/web/out` (built 17 Sep
22:40, dialog code unchanged since aa06605). Harness and raw frames: session
`9ee4803f` scratchpad, `transition/` (`open.mjs`, `tasks.mjs`, `sheet.mjs`,
`focus-cost.mjs`, one folder per run with `trace.json`, `samples.json` and
screencast frames named by their offset from the click).

## What runs today

1. `animal-card.tsx` measures the card and its photo frame on click and
   hands the dialog an origin.
2. `animal-grid.tsx` mounts `AnimalDialog` (a `next/dynamic` chunk) on the
   first open; `warmAnimalDialog` fetches it on pointerdown or focus.
3. The overlay fades in over 100 ms; the box fades and zooms from 0.95 out of
   the card's centre over 200 ms (tw-animate-css, the shadcn dialog recipe).
4. `photo-bloom.tsx` mounts a fixed copy of the card photo, measures the fan's
   front print, tweens the copy there over 360 ms, fades it from 180 ms,
   re-measures at 220 ms and re-aims, and tells the fan to draw its own print.
5. The fan cascades its side prints in on springs; the body staggers five
   children 40 ms apart on a spring.
6. Close: fade and zoom out over 200 ms. Nothing travels back.

## Measurements

Desktop is 1280x800, phone is Playwright's Pixel 7 with touch. 4x is CPU
throttling, roughly a mid-range phone.

| run | dialog in DOM after click | first painted change | visually settled |
| --- | --- | --- | --- |
| desktop 1x, chunk warmed | 350 ms | 374 ms | ~735 ms |
| desktop 1x, second open | 40 ms | | |
| desktop 1x, cold on 4G | 635 ms (chunk 5 to 600 ms) | | |
| desktop 4x | 854 ms | 172 ms, then nothing to 926 ms | ~1300 ms |
| phone 4x | 1037 ms | 309 ms (press), then nothing to 975 ms | ~1500 ms |

Main thread on the throttled runs, open phase:

| run | click task | commit task | frames drawn in first 900 ms |
| --- | --- | --- | --- |
| desktop 4x | 150 ms | 346 ms (106 ms style recalc on autofocus, 33 ms layout) | 1 |
| phone 4x | 263 ms | 431 ms | 2 |

Close at 4x: 538 ms to gone, with 206 ms and 112 ms long tasks.

No layout shifts in any run. At 1x, style, layout and paint are cheap; the
cost is JavaScript.

## Findings

### 1. The first open waits 300 ms for React, on purpose

On the warmed desktop run the click handler finishes at +17 ms, the second
chunk lands at +20 ms, and then nothing happens until a timer fires at
+322 ms and commits the dialog. The timer is React's `FALLBACK_THROTTLE_MS`
(300 ms): a render that only contains retry lanes, committed within 300 ms
of the last Suspense fallback, is held until the 300 ms are up
(`react-dom-client` around the `globalMostRecentFallbackTime +
FALLBACK_THROTTLE_MS` check). The lazy dialog shows its `null` fallback
synchronously on the click, resolves a few ms later, and the retry commit is
throttled. Every visitor's first open pays it. The second open is 40 ms.

Two things feed it:

- `warmAnimalDialog`'s `import()` and the `dynamic()` loader compile to two
  different async entries (Turbopack chunk map in `2gvg0z5fqi5h-.js`:
  module 48681 loads `11467qyxcw6dx.js`, module 28291 loads
  `1sgymn31tuasc.js`, both 3.6 KB, both holding the same shelter-block and
  source-freshness modules). The warm never loads the chunk the component
  needs, so the click still fetches one and the lazy still suspends.
- Even with every chunk in memory, `React.lazy` initialises on first render,
  which suspends once. Warming the module cache cannot remove the fallback;
  only mounting the component before the click can.

### 2. On a phone-class CPU the animation starts after a 400 ms freeze

At 4x the click task takes 150 to 260 ms (the grid re-renders with the
selection and commits the fallback) and the throttled commit takes 350 to
430 ms: mounting 13 fan prints as motion elements, the facts, the shelter
block, then Radix's `focusScope.autoFocusOnMount` forcing the fresh
subtree's first style recalc (106 ms). The steady-state focus cost is 2 to
4 ms with or without the grid in the document (`focus-cost.mjs`), so this is
the size of the mounted subtree, not a `:has()` problem. During the freeze
the overlay, the zoom and the bloom are all scheduled and none of them
draws: one frame in the first 900 ms on desktop 4x. What the visitor sees
on a mid-range phone is a tap, a press squeeze, a second of nothing, and the
dialog appearing with its animations already half over.

### 3. The copy takes off in the wrong shape

The card photo is square (307x307). The copy is laid out on the front
print's 4:3 slot and scaled by width, so at t=0 it is 307x230, vertically
centred on the square, with a different crop of the same picture. For the
first 100 ms the square card photo shows above and below it through a 10%
dim. It reads as a second photo popping out of the card rather than the
photo lifting off. Frames `desk-1x/open-0374.jpg` and `open-0426.jpg`.

### 4. Three motions overlap with no lead

Between +350 and +550 ms the box is zooming and fading, the copy is flying,
the side prints are cascading in, and the body children are staggering,
each on its own clock (a tween, a CSS animation, two springs). Nothing is
the subject. The stagger of 40 ms across five children shows as a ripple in
the text rather than a reveal. The re-aim at 220 ms is a visible correction
when the settle moved the slot.

### 5. The close is not the reverse

The photo does not return to the card; the box shrinks 5% and fades. It is
fine on its own, but with an arrival that carried the photo across, the
departure is a different vocabulary.

### 6. Code weight

The bloom is ~240 lines with `SETTLE_MS`, `RELEASE_MS`, `BLOOM_HOLD_MS`,
`holdFront`, a fail-safe timer, `bloomWillFly` asked from two ends, and a
`slotRect` that queries two stage names, all to reproduce what the platform
now does natively.

## Recommendation

### Step 1, latency (small change, largest gain)

Mount the dialog before it is needed. Set `dialogMounted` from the idle
callback that already prefetches the descriptions (or from the first
pointer over the grid), so `React.lazy` resolves and the first real open
renders synchronously inside the click. Drop `warmAnimalDialog` and its
duplicate chunk group. Expected: first open from 350 ms to ~40 ms on
desktop, and the throttle gone from every device. `AnimalDialog` already
returns `null` with no animal, so the early mount draws nothing.

Then cut the mount cost, which is what remains on phones: mount the fan's
off-window prints and the shelter block after the first paint of the shell
(`startTransition` or a second effect), so the click task commits the
overlay, the box and the front print only. Measure the commit task at 4x
before and after; the target is a first frame within 100 ms of the tap.

### Step 2, the transition itself

Replace the hand-measured bloom and the zoom-from-a-point with a native view
transition. The platform morphs a named element from its old box to its new
box on the compositor, aspect included, and plays the reverse on the way
out. Same-document `document.startViewTransition` is in Chrome 111, Safari
18 and Firefox 133 and later, about 88% of users; the site already opts into
the cross-document form in `globals.css`. Motion 13, which is already in the
bundle, wraps it as `animateView` with spring easing (`motion-dom/view`).

Shape:

- On click, give the card's photo frame and the dialog box
  `view-transition-name` values via a data attribute and Tailwind's
  arbitrary property (`[view-transition-name:animal-photo]`,
  `[view-transition-name:animal-box]`); the fan's front print and the card
  carry the same names inside the dialog. `motion-safe:` and a
  `startViewTransition` check gate it.
- `animateView(() => flushSync(open(id)))` with one duration (about 320 ms)
  and one easing for the photo and the box; the overlay keeps its
  tw-animate fade. Inside the dialog the front print mounts with
  `entrance={false}`; side prints and body fade in after the morph, no
  per-child stagger.
- Close runs the same transition backwards for free, photo returning to the
  card.
- Delete `photo-bloom.tsx`, `holdFront`, `DialogOrigin.photo`, the
  transform-origin calculation and the tests that pin their timings. Keep
  `DIALOG_SURFACE`'s zoom as the fallback for browsers without the API and
  as the reduced-motion path with `duration-0`.

Things to check while building it: the root snapshot cost on the phone
(one page capture per transition; measure with the same harness), that the
card behind is inside the viewport so its snapshot exists (it is, it was
clicked), that Radix's autofocus does not run before the new snapshot is
taken, and that `content-visibility: auto` on cards does not blank the old
image.

### If view transitions are rejected

Keep the architecture and fix findings 3 and 4 directly: start the copy at
the card's exact box and morph its aspect (a wrapper scaled by width, an
inner element counter-scaled, or a `clip-path: inset()` tween), delay the
side prints and the body until the copy is two thirds of the way, drop the
child stagger to one fade, and remove the re-aim by measuring the slot once
after the box's own animation ends rather than at a fixed 220 ms.

### What not to change

The pattern is right. A card growing into its detail with the photo carried
across is the container transform every photo-first index uses, and the
sizes, the overlay strength and the box geometry measured here are all
fine. The audit is about a 300 ms hole, a phone-class freeze, and four
animation systems where one would do.

## Outcome

Implemented on the same day in five commits (idle mount, view transition
open, view transition close, review fixes, less of the dialog inside the
click). Same harness, same scenarios, on the built export of the branch.
"Task" is the longest main-thread task after the click.

| scenario | before | after |
| --- | --- | --- |
| desktop 1x, chunk warmed | 350 ms to dialog | 46 ms |
| desktop 1x, cold on 4G | 635 ms | 44 ms |
| desktop 4x | 854 ms, 346 ms task | 208 ms, 167 ms task |
| phone 4x | 1037 ms, 431 ms task | 201 ms, 152 ms task |
| phone 1x | | 41 ms |

No layout shifts in any run. On the phone at 4x the sequence reads tap,
photo lifting at 320 ms, landed at 408 ms, info card fading in from 551 ms,
side prints at 615 ms. The beat between the photo landing and the card is
the deferred facts and shelter block arriving; on a fast device it is under
a frame.

Left for later: the morph carries the photo the card is showing while the
dialog opens on its first photo (the copy had the mirror bug); an open with
no morph (reduced motion, no view-transition support) still commits the
whole dialog in the click.
