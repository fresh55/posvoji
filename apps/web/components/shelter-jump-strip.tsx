"use client";

import { PawPrint } from "lucide-react";
import { useScrollEdgeFadesX } from "@/hooks/use-scroll-edge-fades";
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
   *  shares no list. Drives the paw and the accent, and is printed bare. */
  count?: number;
  /** "Celje, 2 živali", the chip's accessible name. Present exactly when
   *  `count` is, because it is the only place the noun is said. */
  label?: string;
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
  const scrollRef = useScrollEdgeFadesX<HTMLUListElement>();

  return (
    // scroll-px-10 matches the 2.5rem the fade eats at either end, so a chip
    // the browser scrolls to on focus does not park under the mask. The
    // -mx-1/px-1 pair gives a focus ring room to sit outside its chip: a
    // scroll box clips at its padding edge. py-1 does the same for the ring's
    // top and bottom, because overflow-x: auto clips the other axis too.
    <ul
      ref={scrollRef}
      role="list"
      aria-label={label}
      className="fade-scroll-x mb-3 flex gap-2 overflow-x-auto scroll-px-10 -mx-1 px-1 py-1 sm:hidden"
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
            href={`#zavetisce-${chip.id}`}
            aria-label={chip.label}
            className={cn(
              "inline-flex min-h-11 items-center gap-1.5 rounded-ui border px-3 text-sm whitespace-nowrap text-muted-foreground hover:text-foreground",
              chip.count !== undefined &&
                "border-[var(--filter-accent-border)] text-[var(--filter-accent-foreground)]",
            )}
          >
            {chip.city}
            {chip.count !== undefined && (
              <>
                <PawPrint className="size-3.5 shrink-0" aria-hidden />
                <span className="tabular-nums">{chip.count}</span>
              </>
            )}
          </a>
        </li>
      ))}
    </ul>
  );
}
