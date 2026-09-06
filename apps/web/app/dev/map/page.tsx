import type { Metadata } from "next";
import { NotFoundPage } from "@/components/not-found-page";
import { getMessages } from "@/lib/i18n";
import { MapStatesGallery } from "./map-states-gallery";

// Dev-only. `output: export` writes an HTML file for this route either way, so
// in a production build the page renders the branded 404 instead of the
// gallery, and scripts/drop-dev-output.mjs removes the exported /dev tree once
// `next build` is done. A request for /dev/map in production then falls
// through to 404.html like any other unknown path, with the 404 status a
// static host only gives a missing file.
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
// The route stays in a production build on purpose. Keeping it out instead,
// with a `.dev.tsx` page extension that only `next dev` has, was tried on
// 6 September 2026 and fails `pnpm typecheck` on any machine that has run the
// dev server: `next dev`, `next typegen` and `next build` each write route
// types under .next, tsc checks them against each other, and a /dev layout
// that exists in one set and not the other is a type error. An empty
// generateStaticParams is no way out either, because the static exporter
// rejects it.

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
