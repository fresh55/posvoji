# About-page cat

`cat.glb` is revision 19: revision 15's likeness with twenty full-body clips and four isolated gaze layers for affection, attention and sleep interactions. `poster.webp` is recaptured from the page's own renderer at device pixel ratio 2 to match the first live frame.

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

- Twenty full-body animation clips plus four isolated gaze layers; 54,236 triangles; 1,871,436 bytes (about 1.87 MB). No triangles or textures were added.
- WebP textures, 16-bit skin weights, resampled animation and Meshopt compression. No artificial 1 MB limit was applied.
- The detailed Blender project retains fine fur. The web version uses the coat texture, sheen, sparse ear tufts and soft tapered whisker ribbons.
- Local occlusion has strength 0.16. Neutral browser lighting and tone mapping use exposure 0.9. The eye retains revision 9's restrained reflection.
- The decoded and compressed assets have zero Khronos validation errors and warnings. Looping clips have matching endpoints; Drowse/Sleep/Wake share their transition poses. Twenty-nine pose comparisons measure compression displacement below 0.016 mm. The iris texture is unchanged.
- Live browser checks cover successive tap responses, keyboard response after focusing the cat, gesture continuity and drag rotation without a reaction.
- Automated interaction checks cover shuffled variety, direction-aware reaches, rapid taps, pending clip changes, stale completion events, hover visits, gesture rejection, reduced motion, visibility and cleanup.

The current editable web Blender project, model, pose previews and validation reports are in `posvoji-cat-work/revision-19`; the interaction authoring script is `posvoji-cat-work/animate_affection_v19.py` (loading revision 18). Web export uses `verify/optimize-v19.mjs` and `verify/share-coat-attributes.mjs`. The previous likeness revision 15 remains beside it, authored by `refine_likeness_v15.py`. Earlier web and detailed projects remain in `our-cat-active-v10`; the revision 12 eye build and texture pass remain in `our-cat-v10-work`. `meshopt-decoder.js` is served locally; its MIT licence is in `meshopt-LICENSE.md`.

## Asset licence and attribution

The supplied source archive records **Cat [Murdered: Soul Suspect]**, by **mark2580**, under **CC BY 4.0**:

- https://sketchfab.com/models/836312def1b84e588866500a2bf79f0f
- https://creativecommons.org/licenses/by/4.0/

Adaptations: coat markings, facial geometry, closed right eye, olive left eye, whiskers, fur strands, proportions, seated animations, grooming composition and interactive reactions. Credit is available in the page footer's model-credit disclosure and embedded in the GLB.

Runtime animation API reference: https://modelviewer.dev/docs/index.html#entrydocs-animation-methods-appendAnimation

This asset and its rendered poster retain the recorded asset licence; they are not relicensed under the application's AGPL licence. No reference photographs are embedded in the model.
