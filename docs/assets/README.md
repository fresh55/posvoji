# Posvoji logo assets

The full mark keeps the dog, cat and rabbit beneath a roof. The compact mark
uses the same roof and heart for browser tabs, where animal details are too small.

- **Full source:** `apps/web/public/logo.svg`. Use for headers, posters and
  larger placements. The website uses it at 40px high; prefer the compact mark
  below that size. Keep its background transparent because the header and
  poster render it as a mask in the surrounding text color.
- **Compact source:** `apps/web/app/icon.svg`. A 32-unit drawing with its own
  clear space and light/dark colors, intended for 16–32px browser icons.
- **Documentation:** `logo.svg` uses charcoal (`#313941`); `logo-dark.svg` uses
  pale gray (`#E6EDF3`). These are generated from the full source.
- **Phone icons:** generated PNGs use the full mark on white, with extra
  padding in the Android maskable version.

Keep the proportions, leave clear space around the mark, and use a single color
with strong contrast against the background. The lowercase `posvoji.si` wordmark
continues to use the site's existing typography.

## Drawing and export conventions

The full mark uses a 128 × 120.8 viewBox. Its main contours are 3.6 units wide;
the long roof is optically lighter at 3.2 units, and the small eyes use 2.2 units.
Rounded caps and joins keep the animal contours soft. Preserve the open haunch
curve on the dog and the simple leg joins: reconnecting them adds crowded wedges
at header size. The cat's ears and cheeks are mirrored around x=65.

The compact mark keeps the full mark's roof angle and heart shape, but enlarges
the heart and thickens the roof for small sizes. Do not obtain it by shrinking
the full drawing. Both SVG sources carry accessible names for standalone use;
the website's decorative mask is hidden from assistive technology because its
parent link already names the brand.

All artwork is vector geometry without embedded raster images, external fonts,
scripts or linked assets. Keep the viewBox and the component's aspect ratio in
sync. Documentation exports use that exact ratio, and generated phone icons
centre the drawing without stretching it.

## Header motion

The header adds `LogoHearts` over the static mark. Hover or visible keyboard
focus triggers a 200ms cat blink, then one 380ms heart pulse and two staggered
drifts, finishing within 1.4 seconds. A larger heart leads a smaller one; both rise continuously while
their sideways drift and gentle rotation soften toward the end. The burst
completes after pointer exit and ignores re-entry while
running. It uses the surrounding text color and animates only transform and
opacity. The decoration does not receive pointer events or delay the home link.

Reduced-motion preferences disable it, including when that setting changes
during a burst. Touch entry does not trigger hover motion, and print hides the
overlay. Posters, favicons and exported artwork remain static.

The overlay's heart, cat-eye paths and viewBox must match `public/logo.svg` when
editing the artwork. During a blink, an even-odd clip removes only the original
eye region from the cached header mark; the animated eyes use the same geometry.
The clip is enabled only with supported clipping, screen output and no reduced
motion. No background-colored patch is needed. Browser checks live in
`apps/web/e2e/logo-hearts.spec.ts`.

References: [web.dev animation performance](https://web.dev/articles/animations-guide)
and [W3C animation from interactions](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html).

After editing either source, regenerate all PNGs, the multi-size ICO and both
documentation SVGs from `apps/web`:

```sh
node scripts/build-app-icons.mjs
```

The September 2026 refinement used the original logo as an ImageGen reference,
then rebuilt the final artwork as editable SVG curves. The generated concept is
not a runtime dependency.
