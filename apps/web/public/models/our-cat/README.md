# About-page cat

`cat.glb` is revision 26: revision 15's likeness with twenty-five full-body clips and eight isolated gaze, ear and tilt layers. `poster.webp` retains the matching seated first frame captured at device pixel ratio 2.

## Single nose tap, revision 26

One quick nose tap triggers `Nose sniff`: a small recoil with a reflexive eye
squint, two short sniff movements, then a curious head tilt before settling.
The three-second Blender clip moves only the head, ears and eyelids; all four
paws remain planted. Its 100 ms entry fade preserves the quick recoil.
Held nose contacts do not reserve the camera or trigger cheek rubbing, and
additional taps during the clip do not queue another response. A nose tap
interrupts a hover notice/sniff and returns to quiet seated idle afterwards.

The contact region is a small ellipsoid in the animated head bone's coordinates,
restricted to the head surface. It follows head movement and camera rotation,
with no extra visible mesh, material or draw call. Tests check nose/forehead
separation at three camera angles in four poses, native nose taps on desktop
and phones, and planted paws throughout the new clip.

The asset is 2,134,152 bytes. All 32 previous clips, geometry, rig and textures
are unchanged; the invisible picker remains 8,820 triangles. glTF validation
reports zero errors and warnings. The editable source is
`posvoji-cat-work/revision-26/our-cat-web.blend`. From revision 25:

```sh
blender --background --python apps/web/scripts/animate-cat-nose.py -- SOURCE.blend OUTPUT_DIR
node apps/web/scripts/install-cat-back.mjs OUTPUT_DIR/nose-reaction.glb "Nose sniff"
node apps/web/scripts/prepare-cat-play.mjs
node apps/web/scripts/preview-cat-back.mjs OUTPUT_DIR/preview "Nose sniff"
```

## One-tap leg response, revision 25

A quick leg tap (released within 420 ms) plays the matching 2.5-second
`Paw withdraw front left`, `front right`, `rear left` or `rear right` clip.
He glances down toward that side, draws the selected paw back slightly, then
returns to his seated rest. The other three paws remain planted. There is no
hold response, repeat escalation, queued second withdrawal or grooming follow-up.

The four clips are authored in Blender using a two-bone solve that preserves
limb lengths and the resting foot orientation. Front paws retract about 22.5 mm,
rear paws about 13.8 mm, with a 4.5 mm lift. The head glance starts before the
paw moves. Tests sample every frame, require quiet endpoints and stationary
untouched paws, and bound both displacement and lift. Blender surface checks
find no paw-tail intersection (7.398 mm minimum sampled gap across all four).

Leg selection interpolates the hit triangle's skin weights, so it follows
the animated limb and camera rotation. The invisible proxy preserves limb
boundaries during simplification. This adds no rendered geometry, material
or draw call. Its 8,820 triangles are 83.7% fewer than the visible model's
54,236. The GLB is 2,083,500 bytes; all 28 earlier clips and the original
geometry, rig, materials and textures are unchanged. glTF validation reports
zero errors and warnings.

The editable source is `posvoji-cat-work/revision-25/our-cat-web.blend`.
Starting from revision 24's Blender source and web asset:

```sh
blender --background --python apps/web/scripts/animate-cat-legs.py -- SOURCE.blend OUTPUT_DIR
node apps/web/scripts/install-cat-back.mjs OUTPUT_DIR/leg-reactions.glb "Paw withdraw front left" "Paw withdraw front right" "Paw withdraw rear left" "Paw withdraw rear right"
node apps/web/scripts/prepare-cat-play.mjs
node apps/web/scripts/preview-cat-back.mjs OUTPUT_DIR/preview "Paw withdraw front left"
```

## Calm head affection, revision 24

Head taps now give a gentle forehead lean, relaxed asymmetric ears and a slow
eye close. Holding still for 420 ms before a short stroke selects the longer
`Head rub` cheek sweep. Both Blender-authored clips keep all four paws planted,
ease back to their neutral endpoints, and return to quiet seated idle rather
than resuming a paw greeting or face wash halfway through. Head and chin touches
can interrupt those gestures; the stronger back warning still finishes first.

The head material now includes 7,340 previously unlabelled face/ear triangles.
Eye, eyelid, healed-socket and whisker materials also select head affection,
preventing these touches from choosing generic body gestures. Shape, textures
and the 54,236 visible triangles are preserved. The asset is 1,964,844 bytes;
the regenerated invisible picker has 8,312 triangles (84.7% fewer). Only
`Head pet` and `Head rub` change; the other 26 clips retain revision 23's data.

The editable source is `posvoji-cat-work/revision-24/our-cat-web.blend`.
To reproduce from revision 23's Blender source and web asset:

```sh
blender --background --python apps/web/scripts/animate-cat-affection.py -- SOURCE.blend OUTPUT_DIR
node apps/web/scripts/install-cat-back.mjs OUTPUT_DIR/head-affection.glb "Head pet" "Head rub"
node apps/web/scripts/expand-cat-touch-region.mjs head
node apps/web/scripts/prepare-cat-play.mjs
node apps/web/scripts/preview-cat-back.mjs OUTPUT_DIR/preview "Head pet"
```

Every-frame exported-animation tests require less than 0.01 mm paw movement.
Blender surface checks find no paw-tail intersections, with a 46.881 mm
minimum sampled gap. The glTF validator reports zero errors and warnings.


## Visible, immediate back reaction, revisions 22–23

The first back touch now produces a sharp shoulder flinch, ears pinned back,
a fast 60-degree head turn and an upright tail with a twitching tip. The
100 ms entrance fade preserves the initial flinch; returning to idle uses
the original 220 ms fade. Back pokes take priority over sleep or grooming.
Repeated back pokes finish the current warning before one queued replay.

The original touch strip missed the upper flanks and rump. Revision 22 moved
672 existing torso triangles into the identically shaded back material using
bind-pose skin weights, height and surface direction. Head, chin, tail, limbs
and underside keep their previous assignments. This changes no surface shape,
textures or triangle count. Both public picking and the fast proxy now detect
the broader back area. Regression tests use a fixed upper-flank point that
previously selected a generic body reaction, and verify motion starts on a
fresh load without manually seeking the animation.

The final asset is 1,903,036 bytes with 54,236 visible triangles and an
8,372-triangle picking proxy. The stronger clip changes 16 existing tracks;
the other 27 clips are unchanged from revision 22. The editable animation
project and previews are in `posvoji-cat-work/revision-23`. After installing
Blender's animation export, apply `node apps/web/scripts/expand-cat-touch-region.mjs back`
and regenerate picking data with `prepare-cat-play.mjs`. The touch-region
adjustment is a web export step; it does not modify the Blender geometry.

Every-frame Blender checks find no paw-tail intersections (32.014 mm minimum
sampled gap for the strong clip) and no tail-body intersections during the
raised sweep. The resting tail-rump contact is unchanged. The raised tail
reuses revision 19's arc.

## Irritated back touch, revision 21

The two back responses are authored in Blender at 24 fps and last 3.5 seconds.
A click triggers a quick shoulder twitch, asymmetric ears folding back before
the head moves, a firm narrowed-eye look over the shoulder, and three short
low tail flicks. The first back touch plays the stronger `Back warning` clip;
there is no repeat-touch threshold or cooldown that softens it. The response
finishes before one queued follow-up. B is the equivalent keyboard shortcut.
`Back pet` remains available as a fallback for older assets without `Back warning`.

The new animation replaces `Back pet` and `Back warning` under their existing
runtime names. The other 26 clips, geometry, textures and rig are unchanged.
Only 16 tracks in each edited clip are replaced, with no additional runtime
animation layers or rendering work. The model is 1,848,964 bytes, an increase
of 27,496 bytes (1.51%). The picking data is regenerated for its new hash.

The saved editable source is `posvoji-cat-work/revision-21/our-cat-web.blend`.
It retains revision 19's complete action library with the two revised actions;
revision 20's four isolated curiosity layers remain in the web asset. To rebuild:

```sh
blender --background --python apps/web/scripts/animate-cat-back.py -- SOURCE.blend OUTPUT_DIR
node apps/web/scripts/install-cat-back.mjs OUTPUT_DIR/back-reactions.glb
node apps/web/scripts/prepare-cat-play.mjs
node apps/web/scripts/preview-cat-back.mjs
```

Use revision 19's editable project as `SOURCE.blend`. Installation refuses
incompatible endpoints and preserves the original embedded asset payload.
An every-frame Blender scan of both clips finds no paw-tail intersections;
the minimum sampled gap is 35.501 mm. Tests check low-tail export, neutral
endpoints, ear-before-head timing, strong first-touch responses, and actual rotated back taps
on desktop Chromium, mobile Chromium and WebKit. The changed warning pose and
new side-view back response have reviewed screenshot references.

## Faster picking and curiosity, revision 20

The visible model remains 54,236 triangles. `picking.json` describes detached,
invisible CPU meshes with 8,350 triangles (84.6% fewer). Each anatomical material
is simplified separately with locked borders, retaining the original boundary
vertices and skin weights. Runtime proxies share the live skeleton and update
their bounds for each pick; skinning each compact vertex once per lookup avoids
repeating the transform for adjacent triangles. They add no draw calls, shadows,
frame loop or rendered geometry. Body taps now obtain material and model-space
position in one lookup. All contacts, holds, hover and original reactions use
the same controller rules.

`cat-viewer-runtime.ts` isolates the version-sensitive bridge to model-viewer's
exported `$scene` symbol. If the asset or adapter no longer matches, interaction
falls back to the public full-mesh picking API. The generated data records the
GLB hash; a test requires regeneration when the model changes. Proxies dispose
their own geometries without disposing the shared skeleton or visible model.

Two isolated ear rotations lead the gaze by 260 ms. Two small head-roll layers
then blend in with the existing head/eye tracking, attenuated toward a rear
view. Each added clip has just one rotation track and uses the existing rig;
the previous twenty-four clips and their binary samples are unchanged.

Local Chromium profile, 30 measured samples after five warm-ups:

| Configuration | Full-mesh lookup median / p95 | Proxy tap handler median / p95 |
| --- | --- | --- |
| 1280 × 900, DPR 2 | 22.4 / 23.3 ms | 1.4 / 1.7 ms |
| 390 × 844, DPR 3, 4× CPU throttling | 95.2 / 97.7 ms | 6.3 / 6.5 ms |

The proxy measurement includes the controller's pointer-up handler; neither
configuration used fallback picking. This is a synchronous input-cost sample,
not a physical-phone, GPU, battery or end-to-end latency guarantee. The proxy
agrees with the full mesh on more than 98% of sampled anatomical hits across
five poses and three camera headings; tiny silhouette/boundary differences are
possible. Geometry tests include the raised tail, stretch and sleeping pose.
The JSON adds 147,327 raw bytes (30,315 with Node's default Brotli); it is loaded
with the deferred viewer code. The GLB is 1,821,468 bytes.

All eight existing pose baselines pass without new reference images. Their
test normalizes the fractional-pixel
crop, resolving the previously recorded Windows one-row mismatch. Browser tests
cover proxy taps, orbit dragging, keyboard reactions in Chromium/WebKit,
reduced motion, cancellation and sleep/wake. Unit tests verify ear-first timing.

```sh
# Rebuild curiosity layers (once) and regenerate the matching proxy data:
node apps/web/scripts/prepare-cat-play.mjs
# Profile a running local site and capture the composed poses:
node apps/web/scripts/profile-cat-play.mjs
# Behaviour and the unchanged visual baselines:
pnpm --filter web test:e2e:cat
```

Offline generation uses [Meshoptimizer's simplifier](https://github.com/zeux/meshoptimizer/tree/master/js)
and accepts embedded assets only. The authored source is retained in the model;
the tool does not need an online asset service or Blender at runtime.

## Lossless animation cleanup, revision 19.2

At revision 19.2, the web asset became 1,820,112 bytes, down from 1,871,436 (51,324 bytes,
2.74%). Cleanup removes 80 tracks whose samples equal the node's rest transform
exactly in every referencing clip, and 948 unused or duplicate sampler entries.
Each full-body clip now evaluates 182 tracks instead of 186; each gaze clip
retains its six tracks. A target that changes in any clip keeps its reset tracks
in every other clip, preserving crossfades. Clip durations and all remaining
sampler definitions are unchanged. The entire binary chunk, including geometry,
textures and sample values, is byte-for-byte identical; the poster is retained.

This primarily reduces metadata and a small amount of animation evaluation.
With Node's default Brotli compression the file changes from 1,069,448 to
1,068,728 bytes (720 bytes saved), so the raw size reduction is not a claim of
51 KB saved over an already compressed connection or a measured frame-rate gain.
Loading also waits when the tab is hidden and rechecks visibility after the
renderer import, avoiding model download and WebGL setup after scrolling away.

To repeat the conservative cleanup after a new export:

```sh
node apps/web/scripts/optimize-cat-animation.mjs apps/web/public/models/our-cat/cat.glb
```

The script is idempotent and rejects changes to clip duration. Its tests cover
cross-clip resets, unchanged binary data and shared samplers. Run the dedicated
cat browser suite and repository checks after regenerating the asset.

Same-browser before/after captures of the eight reviewed poses have zero changed
pixels after cleanup. The existing stored screenshot baseline currently expects
a 449 × 497 crop; both the original and optimized model produced 449 × 496 in
that Windows run. Revision 20 fixes the capture rounding without accepting
new reference images. The mobile test setup now scrolls the poster's stage
before waiting for the lazily created viewer.

## Browser hardening after revision 19

The model, poster and lighting are unchanged by this pass. Immediate drags now
perform no application mesh picks; a labelled anatomical tap needs one pick on
release, and a deliberate head/chin hold reuses its pick. Gaze batches coordinate
reads and stops resending settled weights. Queued back touches are counted once;
outside release, blur, pausing, errors and disposal clear interaction safely.

The dedicated `pnpm --filter web test:e2e:cat` suite covers desktop Chromium,
mobile Chromium and WebKit behaviour, plus eight reviewed desktop pose snapshots.
See [the hardening report](../../../../../docs/CAT-HARDENING.md) for measurements,
test procedures and remaining physical-device and mesh-picking limits.

## Affection, attention and sleep, revision 19

- Head and chin touches select `Head pet` and `Chin scratch` (3.25 seconds each). Identically shaded head/chin material regions follow the actual surface. Tap directly, or hold still for 420 ms before a stroke: only this deliberate hold temporarily reserves camera controls. Immediate drags keep orbiting; cancellation, leaving, multiple contacts, visibility changes and cleanup restore the camera. Strokes are bounded to 100 px and five seconds. H/C are equivalent keyboard shortcuts.
- Three or more back touches within eight seconds request `Back warning`, adding a firmer look and a stronger tail-tip twitch. The playing response still finishes; bursts coalesce to one follow-up. Head/chin affection or an eight-second break resets escalation.
- A mouse dwell on the cat starts at most six seconds of gentle head/open-eye tracking. Four constant `Gaze` clips contain only head and eye tracks, blended through the public model-viewer API at 30 updates/second with easing. No pointer-move raycasts, private renderer access or React frame updates are used. Looking from behind attenuates tracking. Leaving, dragging, a response, grooming, pausing or expiry removes the layers.
- After at least 45 seconds without input, the cat finishes any protected gesture, drowses for four seconds and loops a six-second breathing pose. A touch during drowsing waits; a sleeping cat plays `Wake` (2.5 seconds) before the requested response. Sleep transitions share the same poses. Returning to Companion after waking starts at its neutral frame.
- All original fourteen clips and textures are unchanged. Added material groups retain shared coat bounds for picking, without added triangles. Motion preferences, offscreen/hidden pausing, queue limits and existing gestures apply throughout.

## Raised tail, revision 18

- The back response now lifts the tail upright behind the rump, gives the tip a short twitch, then lowers it smoothly beside the paws. The lift peaks near ear height (0.501 m). Shoulder, head and ear timing remains from revision 17; the 3.5-second duration and neutral endpoints are unchanged.
- All other thirteen clips, geometry and textures match revision 17 exactly. No additional geometry or per-frame browser work is introduced.
- All fourteen clips pass the two-frame paw-tail scan. The back response's minimum sampled gap is 46.60 mm. An additional every-frame tail/body scan finds no intersections during the raised sweep (frames 5-75); pre-existing tail-rump contact at the resting endpoints is unchanged and is recorded separately.

## Clearer back reaction, revision 17

- `Back pet` still lasts 3.5 seconds. It now starts with a quick shoulder flinch, turns the head 32 degrees with a small upper-body turn, briefly flicks the ears back, and settles with a blink. The expression is momentarily mildly irritated; the resting face and likeness are unchanged.
- The other thirteen clips, geometry, textures and anatomical touch materials are retained from revision 16. Repeated clicks still finish the current gesture before playing one queued follow-up.
- All fourteen clips retain identical start/end poses. The two-frame paw-tail scan finds no intersections; the new back reaction's smallest sampled distance is 34.03 mm. Browser checks cover its visible poses, rotated back picking and repeated back touches without restarting the current reaction.

## Back and tail touches, revision 16

- Touching the back plays `Back pet` (3.5 seconds): a small contented arch, head lean and slow blink. Touching the tail plays `Tail flick` (3 seconds): a glance back, ear twitch and outward tail-tip flick.
- The actual coat triangles carry identically shaded materials named `Back touch region` and `Tail touch region`. Material picking replaces the pointer-down hit test; it adds no raycasts during pointer movement. The region follows the animated surface after camera rotation and is retained in a queued request. Ordinary touches retain the ten-gesture shuffle.
- Repeated touches finish the playing response and request at most one follow-up. Repeating the same region restarts its clip only at the finished, matching endpoint. Automatic washing and paw greetings remain protected.
- With the viewer focused, B invites the back response and T the tail response. Enter/Space retain the general invitation. Reduced motion, swipe/drag rejection and hidden-tab pausing also apply to these responses. No visible controls or hotspots were added.
- The exporter preserves the two material names and shares the coat vertex buffers across its five material primitives. This retains conservative whole-coat raycast bounds: separately bounded skinned tail geometry otherwise misses clicks after posing in model-viewer 4.3.1. There are no added triangles or proxy hitboxes.
- The new clips keep the paws and tail clear at two-frame samples: minimum distances are 42.99 mm for Back pet and 46.88 mm for Tail flick. All fourteen clips have matching endpoints.

## Reference likeness, revision 15

- A small crown dome rounds the silhouette between the ears. The white break through the grey cap is broader, uneven and softly feathered, while the existing outer patch locations and ears are preserved.
- The healed socket has a shallow fur-covered depression and a shorter, faint, interrupted seam. The packed texture is explicitly unpacked, reloaded and repacked before export; the two edited PNGs are verified byte for byte against the images embedded in the raw GLB.
- The lower eye rim is lighter than the upper rim, with softer pigment and roughness 0.76. The globe and iris texture retain their previous size and colour. A gentle local skin-weight smoothing reduces irregularities in the closing lid; sampled full-blink browser renders show no iris leak.
- Modest whisker-pad and chin fullness blends into softer jowls. The whisker roots follow the same local shape change. The existing mouth crease is softened without changing its course.
- Only the terminal tail section is tapered slightly, with a restrained lift to the underside colour. The cheeks-to-neck transition is softened locally; body and ear proportions are retained.
- The paw-tail scan still finds no intersections at two-frame intervals across all twelve clips, with a smallest sampled gap of 14.55 mm. No animation tracks were changed in this revision.

## Clearance and eye proportions, revision 14

- The outer tail curve sits beside the front-paw landing area. The same bone correction is applied to all twelve clips, preserving their endpoints and tail motion.
- A triangle-intersection scan sampled every two frames found paw-tail intersections in the previous Companion, Face wash, Stretch and Playful reach left clips. The revised clips have none at those samples; the smallest sampled paw-vertex-to-tail-surface distance is 14.55 mm.
- The open eye globe, surrounding aperture and eyelid pivots are reduced together by 10%, with the adjustment feathered into the cheek. Eyelid translation tracks are scaled to match, keeping the rolling blink closed. This largely reverses the earlier 12% globe enlargement; pupil shape and olive colouring are unchanged.
- Browser renders verify the resting face, full blink, stretch and cheek wipe. The poster is regenerated from the new browser render.

## Face revision 12

- The open left eye sits inside lids: the upper lid overlaps the iris, both lids carry a thin dark margin, the aperture is an almond with the outer corner about 8 degrees higher than the inner one, and the inner corner no longer shows a gap. Revision 12 enlarged the globe by 12%; revision 14 reduces that globe and its aperture as described above. The closing lid curves over the cornea and closes fully at the deepest frame of every clip, with a small clearance that is zero while the eye is open.
- The dark margin is a Blender node mix that the glTF exporter cannot bake, so the export writes it as a vertex colour multiplier on the rim material. The rim roughness is a flat 0.6 rather than a ramp.
- The coat texture: the mouth seam is a soft greyish pink line with a short philtrum and no black; the crown grey is one cap from ear to ear with a narrow white blaze and feathered edges; ear interiors grade from pink to white toward the rim with only the fold dark; low contrast fur direction radiates from the nose; the nose pink is desaturated toward salmon; the healed socket carries a faint short lid line. The occlusion map is deeper in the eye socket, the healed depression, the ear bases and under the cheeks and chin.
- The ear tufts are the mesh `Sparse ear opening tufts`, not paint, and are unchanged.

## Active routine

The 28-second `Companion` loop replaces the previous 43.5-second cycle with its long subtle resting passage:

- 0-6 seconds: visible head turns, tilts, breathing, tail motion, blinks and ear flicks.
- 6-13.5 seconds: the complete original paw-washing performance and its transitions.
- 13.5-20 seconds: another looking-around passage, with different head motion.
- 20-22.6 seconds: a raised-paw greeting.
- 22.6-28 seconds: active settling and looking around, easing into the loop's first frame.

The greeting borrows the right foreleg pose from the existing grooming rig, with a small wrist movement and head inclination. `Nuzzle` is a friendly head lean and blink; it does not move the cat across the stage. There is no new locomotion or geometry deformation baked into the source mesh.

## Interaction

Untargeted taps on the mesh, Enter, or Space invite ten kinds of response; anatomical regions select their dedicated reactions. The original `Slow blink`, `Paw hello`, `Nuzzle` and `Notice` are joined by:

- `Head rub` (3.5 seconds): a cheek lean and sweep with a closed eye.
- `Sniff` (2.75 seconds): a forward nose lift, two small bobs and ear twitches.
- `Face wash` (5.25 seconds): a paw lick followed by a folded-paw cheek wipe.
- `Stretch` (4.5 seconds): a seated shoulder stretch with both forepaws reaching forward.
- `Yawn` (3.75 seconds): a gentle jaw opening, tongue movement and sleepy blink.
- `Playful reach` (2.917 seconds): separate left and right clips, chosen from the touched side in model coordinates. Keyboard activation chooses either side.

A shuffled bag gives each kind a turn and avoids consecutive repeats; the two reaching directions count as one gesture. The current reaction always finishes: repeated inputs request just one follow-up, without restarting the clip or building a backlog. Automatic washing (6-13.5 seconds) and the paw greeting (20-22.6 seconds) also finish before a requested response starts. A 220 ms crossfade softens transitions.

The controller remembers one position in `Companion` and resumes it after the last response. Stale completion events are ignored; public clip time supplies a fallback when model-viewer omits a completion event. The fallback runs only during reactions or while a tap is waiting for an automatic gesture to finish. Hiding the cat or enabling reduced motion clears the pending request.

Mouse dwell over the actual mesh starts the bounded gaze behavior after 220 ms, once per mesh visit. For an older asset without gaze layers, the controller falls back to a sniff, or a notice if he just sniffed. A hit test runs only after the pointer settles; settling outside the mesh or leaving the stage resets the invitation. Hover does not interrupt reactions, washing, the automatic paw greeting or a pending tap. Dragging, long presses, cancelled pointers, multiple contacts and taps on blank space are not treated as taps. Drag/swipe/arrow-key rotation remains available, and vertical touch gestures can scroll the page.

Reaction transitions use model-viewer's public `appendAnimation` time/fade options to prepare the incoming action, then select it as the main animation and fade out the outgoing action. Switches between different clips never seek `currentTime`: in version 4.3.1 that setter resets the entire mixer, snapping the outgoing pose before the crossfade. A queued replay of the same completed clip seeks only at its matching endpoint. Cached incoming actions are stopped before reuse to reset their loop counts. The visual asset, lighting and rendering resolution are unchanged by this controller fix.

There are no visible controls, captions or sounds. Animation pauses offscreen and in hidden tabs, and reduced motion disables automatic animation and responses. The model and renderer load only when needed on the about page.

## Web preparation and verification

- Twenty full-body animation clips plus eight isolated attention layers; 54,236 visible triangles; 1,903,036 bytes (about 1.90 MB). Picking uses a separate 8,372-triangle CPU proxy. No visible triangles or textures were added.
- WebP textures, 16-bit skin weights, resampled animation and Meshopt compression. No artificial 1 MB limit was applied.
- The detailed Blender project retains fine fur. The web version uses the coat texture, sheen, sparse ear tufts and soft tapered whisker ribbons.
- Local occlusion has strength 0.16. Neutral browser lighting and tone mapping use exposure 0.9. The eye retains revision 9's restrained reflection.
- The decoded and compressed assets have zero Khronos validation errors and warnings. Looping clips have matching endpoints; Drowse/Sleep/Wake share their transition poses. Twenty-nine pose comparisons measure compression displacement below 0.016 mm. The iris texture is unchanged.
- Live browser checks cover successive tap responses, keyboard response after focusing the cat, gesture continuity and drag rotation without a reaction.
- Automated interaction checks cover shuffled variety, direction-aware reaches, rapid taps, pending clip changes, stale completion events, hover visits, gesture rejection, reduced motion, visibility and cleanup.

The latest editable project and back-reaction previews are in `posvoji-cat-work/revision-23`, authored with the scripts above. The preceding complete export, pose previews and validation reports are in `posvoji-cat-work/revision-19`; its interaction authoring script is `posvoji-cat-work/animate_affection_v19.py` (loading revision 18). That web export uses `verify/optimize-v19.mjs` and `verify/share-coat-attributes.mjs`. The previous likeness revision 15 remains beside it, authored by `refine_likeness_v15.py`. Earlier web and detailed projects remain in `our-cat-active-v10`; the revision 12 eye build and texture pass remain in `our-cat-v10-work`. `meshopt-decoder.js` is served locally; its MIT licence is in `meshopt-LICENSE.md`.

## Asset licence and attribution

The supplied source archive records **Cat [Murdered: Soul Suspect]**, by **mark2580**, under **CC BY 4.0**:

- https://sketchfab.com/models/836312def1b84e588866500a2bf79f0f
- https://creativecommons.org/licenses/by/4.0/

Adaptations: coat markings, facial geometry, closed right eye, olive left eye, whiskers, fur strands, proportions, seated animations, grooming composition and interactive reactions. Credit is available in the page footer's model-credit disclosure and embedded in the GLB.

Runtime animation API reference: https://modelviewer.dev/docs/index.html#entrydocs-animation-methods-appendAnimation

The model, derived picking data and rendered poster retain the recorded asset licence; they are not relicensed under the application's AGPL licence. No reference photographs are embedded in the model.
