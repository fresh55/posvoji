# About-page cat

`cat.glb` is web revision 4 of the approved `our-cat-likeness` adaptation. The coat's 18,554 source vertices are unchanged, preserving the approved proportions and facial shape. `poster.webp` is captured from the same browser renderer, lighting and resting pose used on the page. All assets are served locally, with no reference photographs embedded.

The 15-second Companion animation combines 8 seconds of resting, the original 6-second grooming performance and two half-second transitions into one continuous loop. Resting includes an open-eye blink, separate ear flicks, breathing and a slower tail sway (about 36 mm peak movement from its mean). The healed right eye stays closed. There are no visible controls or captions beside the cat. The page loads it when visible, pauses animation offscreen or in a hidden tab, and respects reduced motion. Dragging, swiping or arrow keys rotates the view; vertical touch gestures remain available for scrolling.

## Web preparation

- Soft, tapered 1.7 mm whisker ribbons with alpha-faded edges and tips replace the subpixel tubes.
- The web copy omits the 3.60 MB normal map, noisy fur strands and tiny ear wisps. Detailed Blender sources retain the fine fur.
- The painted coat carries the surface detail, with restrained sheen and roughness. The page uses neutral lighting and tone mapping at exposure 0.9, selected by browser comparison.
- Redundant white vertex colours and tangents are removed. WebP textures, resampled animation, 16-bit skin weights and Meshopt compression reduce the GLB from 9,035,196 to 1,009,912 bytes and triangles from 90,832 to 39,352.
- `meshopt-decoder.js` is the locally served meshoptimizer decoder. Its MIT licence is in `meshopt-LICENSE.md`. No CDN request is needed.
- Khronos validation of the decoded asset reports zero errors and warnings. A Blender comparison across seven idle/grooming poses measured a maximum compression displacement below 0.015 mm.

The revision's editable web and detailed Blender projects are retained in the local `our-cat-web-refined` delivery folder, with separate Idle and Grooming actions as well as the continuous Companion cycle. Head retopology is intentionally deferred to preserve the approved likeness.

## Asset licence and attribution

The supplied source archive records **Cat [Murdered: Soul Suspect]**, by **mark2580**, under **CC BY 4.0**:

- https://sketchfab.com/models/836312def1b84e588866500a2bf79f0f
- https://creativecommons.org/licenses/by/4.0/

Adaptations: coat markings, facial geometry, closed right eye, olive left eye, whiskers, fur strands, proportions and a seated idle animation. Credit is also available in the page footer's model-credit disclosure and embedded in the GLB.

This asset and its rendered poster retain the recorded asset licence; they are not relicensed under the application's AGPL licence.
