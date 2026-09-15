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
 * The SVG serves any size where a browser takes one, the 180px PNG is what
 * iOS reads, and the two square PNGs beside them are what an Android install
 * needs: Chrome asks for 192 and 512 and puts anything else, an SVG included,
 * inside a white circle of its own. The maskable one is the same mark with
 * the padding a launcher's crop needs, drawn by scripts/build-app-icons.mjs
 * from the same app/icon.svg, so the three cannot drift apart.
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
    // hex is how they stop matching. Light in both themes and not the dark
    // half under prefers-color-scheme, because a manifest is read once at
    // install time and cannot follow the phone afterwards: a dark install
    // would keep a dark splash into the light morning. The icons are drawn on
    // the same white for the same reason.
    background_color: THEME_COLOR.light,
    theme_color: THEME_COLOR.light,
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      // Cropped by the launcher to its own shape, so the mark inside sits in
      // the safe circle with a quarter of the icon as padding all round. A
      // separate file and not the same PNG twice: an icon that declares both
      // purposes is drawn full bleed on one launcher and cropped into on the
      // next, and one of the two always looks wrong.
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
