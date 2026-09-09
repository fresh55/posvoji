import type { MetadataRoute } from "next";
import { getMessages } from "@/lib/i18n";
import { SITE_NAME, THEME_COLOR } from "@/lib/site-metadata";

/**
 * What a phone reads when somebody adds the site to their home screen.
 *
 * Without one, Add to Home Screen falls back to the page title and a guessed
 * icon, on a site people are told to come back to as new animals are listed.
 *
 * At the app root rather than inside a locale group, so it reaches both: app/
 * has no layout of its own above app/(sl) and app/(en)/en, and the three icons
 * beside this file already land in every page's head from here. One manifest
 * for the pair, declared in Slovenian, which is the language the unprefixed
 * routes are written in and the one start_url opens.
 *
 * display: standalone and not fullscreen. The site is a document to read and
 * share, and a shared link opened from a home screen icon should still show
 * the status bar the phone would otherwise hide.
 *
 * The icons are the two the export already ships. The SVG serves any size, and
 * the 180px PNG is what a device that will not take an SVG falls back to.
 */

// The same declaration app/robots.ts and app/sitemap.ts carry, and for the
// same reason: a metadata route is a Route Handler, and under output: export
// one that does not declare itself static fails the build.
export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE_NAME,
    short_name: SITE_NAME,
    description: getMessages("sl").metadataDescription,
    start_url: "/",
    display: "standalone",
    lang: "sl",
    // The light half of rootViewport's theme colour, read from the same
    // constant rather than retyped: a splash screen drawn in the page's own
    // ground is the one that does not flash, and two files spelling the same
    // hex is how they stop matching.
    background_color: THEME_COLOR.light,
    theme_color: THEME_COLOR.light,
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
