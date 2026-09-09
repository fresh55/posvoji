"use client";

import { PawPrint } from "lucide-react";
import { useScrollEdgeFadesX } from "@/hooks/use-scroll-edge-fades";
import { SCROLL_STRIP } from "@/lib/scroll-strip";
import { shelterAnchorId } from "@/lib/shelter-path";
import { cn } from "@/lib/utils";

/** One town in the strip. Not ShelterCardData: this component is the page's
 *  only client boundary, and a function cannot cross it. The card takes the
 *  locale's formatter and calls it (shelter-card.tsx); the strip is handed the
 *  sentence already formatted, which is the same fact in the form a client
 *  component can be given it. */
export type ShelterJumpChip = {
  id: string;
  city: string;
  /** How many animals the dataset holds for this shelter, absent for one that
   *  shares no list. Drives the paw and the accent.
   *
   *  The number and its sentence travel together, in one optional field rather
   *  than two, because they are one fact: a chip with a count and no sentence
   *  would have a paw and no accessible noun, and the type would allow it. The
   *  label is the formatted count alone ("2 živali"); the strip puts the town
   *  in front of it, so the town is spelled in one place. */
  count?: { value: number; label: string };
};

/**
 * The register's own index, below sm and nowhere else.
 *
 * At three columns the towns form a column of their own that the eye runs
 * down, and beside them the counts do the same: a reader looking for
 * Ljubljana, or for the shelters that share a list, reads the page and finds
 * them. At one column there is no column. The grid is about 6,600px at 375px
 * and shows a card and a half at a time, so the seventeen towns arrive one
 * every four seconds of scrolling and the sort note above says the order
 * without giving anyone a way to use it. This is that column, folded into a
 * band the reader can see all of at once. From sm the grid draws it again for
 * free, so the strip goes away rather than repeating it.
 *
 * One row that scrolls sideways, not a wrapping block. Seventeen chips of a
 * town plus a count wrap to 460px at 375px and to 564px at 320px, which pushed
 * the first card from y=423 to y=899: an index that costs two screens is not
 * an index, it is a second page in front of the page. The row is the idiom
 * this site already has for exactly this, the active-filters strip
 * (filters/filter-chips.tsx), down to the utility that draws it: fade-scroll-x
 * hides the scrollbar and masks whichever edge still holds content, driven by
 * useScrollEdgeFadesX. It costs 52px whatever the register grows to.
 *
 * A client component only because that hook needs a ref. Nothing here has
 * state, and the page around it stays a server-rendered document.
 */
export function ShelterJumpStrip({
  chips,
  label,
}: {
  /** In the order the grid draws them: by town, then by name. */
  chips: ShelterJumpChip[];
  /** "Skok na zavetišče" / "Jump to a shelter", the row's accessible name. */
  label: string;
}) {
  // The chips are server rendered and never move, so the container's own
  // resize entry is the only thing that can change this row's scroll width.
  const scrollRef = useScrollEdgeFadesX<HTMLUListElement>({
    watchChildren: false,
  });

  return (
    // SCROLL_STRIP carries the fade, the scroll padding and the horizontal
    // room a focus ring needs; py-1 is this row's own vertical half of that,
    // because overflow-x: auto clips the other axis too.
    <ul
      ref={scrollRef}
      role="list"
      aria-label={label}
      className={cn(SCROLL_STRIP, "mb-3 flex gap-2 py-1 sm:hidden")}
    >
      {chips.map((chip) => (
        <li key={chip.id} className="shrink-0">
          {/* The count comes with the town because it is half of what the
              column answered: which shelters share a list, and how big each
              list is. The same accent as the card's pill, and only on the
              chips whose shelters share one, because that is the site's one
              statement of that fact and it is being made here about the same
              shelters. The rest stay neutral. No pill fill under it: eleven
              filled blocks in a band this size state the fact louder here than
              on the card it belongs to.

              The bare number, and the noun only in the accessible name. The
              card's pill has a line to itself and prints "2 živali"; a row
              that has to hold seventeen towns on one axis does not, and the
              paw beside the number already says what is being counted to
              anyone reading the row. A screen reader has no paw, so the label
              supplies the noun there and nowhere else.

              min-h-11 rather than the tap-target overlay: the chips sit 8px
              apart, which is inside the overlay's 4px-per-side overhang on a
              chip drawn shorter than 44px, so the neighbour would take presses
              meant for its left-hand side. The rule lives with the utility in
              globals.css. */}
          <a
            href={`#${shelterAnchorId(chip.id)}`}
            aria-label={chip.count && `${chip.city}, ${chip.count.label}`}
            className={cn(
              "inline-flex min-h-11 items-center gap-1.5 rounded-ui border px-3 text-sm whitespace-nowrap text-muted-foreground outline-hidden hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring",
              chip.count &&
                "border-[var(--filter-accent-border)] text-[var(--filter-accent-foreground)]",
            )}
          >
            {chip.city}
            {chip.count && (
              <>
                <PawPrint className="size-3.5 shrink-0" aria-hidden />
                <span className="tabular-nums">{chip.count.value}</span>
              </>
            )}
          </a>
        </li>
      ))}
    </ul>
  );
}
