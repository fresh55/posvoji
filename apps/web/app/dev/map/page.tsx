import { NotFoundPage } from "@/components/not-found-page";
import { MapStatesGallery } from "./map-states-gallery";

// Dev-only. `output: export` writes an HTML file for every route it can
// reach and offers no way to leave one out, so the route stays and a
// production build serves the branded 404 from it instead of the gallery.
//
// Rendered, not thrown. notFound() was tried first, from a client component
// and then from this server one with app/dev/not-found.tsx as its boundary,
// and both times the export wrote an `<html id="__next_error__">` shell with
// an empty body: the branded page arrived only in the RSC payload and drew
// after hydration, so the file was blank with JavaScript off. A prerendered
// 404 status is also nothing a static host reads. Returning the page gives
// the export the same markup out/404.html has, server-rendered, under this
// tree's own root layout. The gallery keeps its own "use client" file because
// ShelterMap takes an onPick handler.
//
// The alternative was leaving the route out of the export so that a request
// falls through to out/404.html, which would drop the stray file and pick up
// the site's own root layout. Next has no supported switch for that: a static
// route cannot opt out, and generateStaticParams answers only for dynamic
// segments. Restructuring /dev behind a dynamic segment to buy one would cost
// more than the file it saves.
export default function DevMapStatesPage() {
  if (process.env.NODE_ENV === "production") {
    return <NotFoundPage locale="sl" />;
  }

  return <MapStatesGallery />;
}
