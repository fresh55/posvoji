import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The frame every page is drawn in, and the only place its width is decided.
 *
 * The invariant: the header, `main` and the footer share one left edge,
 * because they share this element's max-width. No page sets a frame width of
 * its own. A page may hold its text to a narrower measure, but it does that
 * with a max-width on `main` and no `mx-auto`, so the column still starts on
 * the frame's left edge instead of drifting into the middle of it.
 *
 * Before this, six pages repeated `max-w-7xl` on the shell and then set
 * `max-w-5xl` (or `max-w-xl`) on `main` alone. The header and footer stayed on
 * the wider grid, so at 1440px the logo began 96px to the left of the h1 under
 * it on five of the six page types.
 */
const FRAME_WIDTHS = {
  /**
   * The homepage. It is the declared exception: the filter sidebar sits
   * beside the animal grid and needs the extra column.
   */
  wide: "max-w-7xl",
  /** Every other page: one column of prose and cards. */
  default: "max-w-5xl",
} as const;

export type PageWidth = keyof typeof FRAME_WIDTHS;

/**
 * The two heading sizes the site has, and there is no third.
 *
 * An index or landing page names a whole part of the site and takes the
 * larger; a page about one animal, one shelter or one municipality takes the
 * smaller. The homepage is an index, so it takes the larger one: it used to
 * carry the quietest h1 on the site.
 */
export const INDEX_TITLE_CLASS =
  "text-balance text-3xl font-medium tracking-tight sm:text-4xl";
export const DETAIL_TITLE_CLASS =
  "text-balance text-2xl font-medium tracking-tight sm:text-3xl";

export function PageShell({
  width = "default",
  children,
}: {
  width?: PageWidth;
  children: ReactNode;
}) {
  return (
    <div
      // flex-1 and not min-h-full. The body is `flex min-h-full flex-col`, so
      // its own height is auto and a percentage min-height resolved against it
      // did nothing: a short page (the found-animal lookup ends around y=480)
      // left the footer floating mid-viewport with blank document below it. As
      // a flex item of the body's column this grows to the bottom instead.
      className={cn(
        "mx-auto flex w-full flex-1 flex-col px-gutter",
        FRAME_WIDTHS[width],
      )}
    >
      {children}
    </div>
  );
}
