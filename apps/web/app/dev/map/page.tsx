import type { Metadata } from "next";
import { NotFoundPage } from "@/components/not-found-page";
import { getMessages } from "@/lib/i18n";
import { MapStatesGallery } from "./map-states-gallery";

// Dev-only. `output: export` writes an HTML file for this route either way, so
// a production build serves the branded 404 from it instead of the gallery.
//
// Rendered, not thrown. notFound() was tried first, from a client component
// and then from this server one with an app/dev/not-found.tsx boundary, and
// both times the export wrote an `<html id="__next_error__">` shell with an
// empty body: the branded page arrived only in the RSC payload and drew after
// hydration, so the file was blank with JavaScript off. A prerendered 404
// status is also nothing a static host reads. Returning the page gives the
// export the same markup out/404.html has, server-rendered, under this tree's
// own root layout. The gallery keeps its own "use client" file because
// ShelterMap takes an onPick handler.
//
// The route could be kept out of the export instead, so that a request falls
// through to out/404.html under the site's own root layout: name this file
// page.dev.tsx and add "dev.tsx" to pageExtensions only outside production.
// That trades this branch, the title below and the /dev layout's lang and
// theme reasoning for a conditional next.config. Not worth it for one file
// that robots.txt already disallows, but it is a supported switch, not an
// impossibility.

// Both faces of the route, named where the branch that picks them is. A page's
// metadata wins over its layout's, so the layout stays title-less.
export const metadata: Metadata = {
  title:
    process.env.NODE_ENV === "production"
      ? `${getMessages("sl").notFoundTitle} | Posvoji.si`
      : "Map states | Posvoji.si dev",
};

export default function DevMapStatesPage() {
  if (process.env.NODE_ENV === "production") {
    return <NotFoundPage locale="sl" />;
  }

  return <MapStatesGallery />;
}
