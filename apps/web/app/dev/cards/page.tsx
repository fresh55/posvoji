import type { Metadata } from "next";
import { NotFoundPage } from "@/components/not-found-page";
import { getMessages } from "@/lib/i18n";
import { CardGallery } from "./card-gallery";

// Dev-only, and built the same way app/dev/map/page.tsx is; the reasoning is
// written out in full there and is not repeated here. The short of it:
// `output: export` writes an HTML file for this route either way, so in a
// production build the page renders the branded 404 instead of the gallery,
// and scripts/drop-dev-output.mjs removes the exported /dev tree once
// `next build` is done. That script drops out/dev as a directory rather than
// naming routes, so this one needed no change to it. app/robots.ts disallows
// /dev/ whole, and app/sitemap.ts lists pages one by one and never listed
// /dev, so neither needed a change either.
//
// Rendered, not thrown: notFound() exported an empty `__next_error__` shell.
// And the route stays in a production build on purpose, because a route that
// exists only under `next dev` fails `pnpm typecheck` against the route types
// `next build` writes.

// Both faces of the route, named where the branch that picks them is. A page's
// metadata wins over its layout's, so the layout stays title-less.
export const metadata: Metadata = {
  title:
    process.env.NODE_ENV === "production"
      ? `${getMessages("sl").notFoundTitle} | Posvoji.si`
      : "Card grid | Posvoji.si dev",
};

export default function DevCardGridPage() {
  if (process.env.NODE_ENV === "production") {
    return <NotFoundPage locale="sl" />;
  }

  return <CardGallery />;
}
