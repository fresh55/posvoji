# About-page cat

`cat.glb` is web revision 5 of the approved `our-cat-likeness` adaptation. The coat retains its 18,554 vertices and approved overall proportions. Local adjustments to the upper lid, muzzle and one ear tip are at most 1.63 mm. `poster.webp` is captured from the same browser renderer, lighting and resting pose used on the page. All assets are served locally, with no reference photographs embedded.

The 43.5-second Companion animation combines 36 seconds of resting, the original 6-second head/paw grooming performance and two three-quarter-second transitions into one continuous loop. Blinks and left/right ear flicks are irregularly spaced, alongside breathing and a gentle tail movement. The tail curls around the seated haunch towards the forepaws, and the head has a three-degree inclination. The healed right eye stays closed. There are no visible controls or captions beside the cat. The page loads it when visible, pauses animation offscreen or in a hidden tab, and respects reduced motion. Dragging, swiping or arrow keys rotates the view; vertical touch gestures remain available for scrolling.

## Web preparation

- Soft, tapered 1.7 mm whisker ribbons with alpha-faded edges and tips replace the subpixel tubes.
- The web copy omits the 3.60 MB normal map, noisy fur strands and tiny ear wisps. Detailed Blender sources retain the fine fur.
- The painted coat carries the surface detail. Existing neutral patch edges are softly feathered, with no invented spots or stripes. Faint whisker-root shading, a short philtrum, upper-lid crease and toe separations follow the existing anatomy. Fourteen soft ear-opening tufts add only 56 triangles.
- A separate 1024px short-range occlusion map uses strength 0.16; shadows are not multiplied into the white base colour. White sheen uses colour factor 0.28 and roughness 0.6. The olive eye keeps its existing broad oval pupil and has a restrained clearcoat reflection. The page uses neutral lighting and tone mapping at exposure 0.9.
- Redundant white vertex colours and tangents are removed. WebP textures, resampled animation, 16-bit skin weights and Meshopt compression reduce the GLB from 9,035,196 to 988,324 bytes and triangles from 90,832 to 39,408.
- `meshopt-decoder.js` is the locally served meshoptimizer decoder. Its MIT licence is in `meshopt-LICENSE.md`. No CDN request is needed.
- Khronos validation of the decoded asset reports zero errors and warnings. A Blender comparison across seven idle/grooming poses measured a maximum compression displacement below 0.015 mm.

The revision's editable web and detailed Blender projects are retained in the local `our-cat-photo-refined` delivery folder, with separate Idle and original Grooming actions as well as the continuous Companion cycle. Earlier deliveries remain intact. Head retopology, pointer-following and tap-triggered grooming are deferred. A narrow slit pupil, strong follicle dots, a drawn smile, extra coat markings and glass-like ear transmission were avoided to preserve the reference cat's appearance.

## Asset licence and attribution

The supplied source archive records **Cat [Murdered: Soul Suspect]**, by **mark2580**, under **CC BY 4.0**:

- https://sketchfab.com/models/836312def1b84e588866500a2bf79f0f
- https://creativecommons.org/licenses/by/4.0/

Adaptations: coat markings, facial geometry, closed right eye, olive left eye, whiskers, fur strands, proportions and a seated idle animation. Credit is also available in the page footer's model-credit disclosure and embedded in the GLB.

This asset and its rendered poster retain the recorded asset licence; they are not relicensed under the application's AGPL licence.
