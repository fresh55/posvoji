"use client";

import { type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { type SpeciesFilter } from "@/lib/filters";
import { SPECIES_TAB_ORDER } from "@/lib/species";
import { useI18n } from "@/components/i18n-provider";
import { SPECIES_TAB_ICONS } from "@/lib/animal-icons";
import { cn } from "@/lib/utils";

// The row scrolls sideways, so the fade needs a left/right mask; the shared
// fade-scroll utility only builds a top/bottom one for vertical lists (see
// filter-sidebar.tsx), so this is its horizontal counterpart, kept local
// since only this row needs it. A container that fits gets no mask at all.
const EDGE_SLACK_PX = 8;

const LABELS: Record<"sl" | "en", Record<SpeciesFilter, string>> = {
  sl: { all: "Vse", dog: "Psi", cat: "Mačke", other: "Ostale" },
  en: { all: "All", dog: "Dogs", cat: "Cats", other: "Other" },
};

export function SpeciesTabs({
  value,
  onChange,
  counts,
  roster,
  disabled = false,
  fullWidth = false,
}: {
  value: SpeciesFilter;
  onChange: (species: SpeciesFilter) => void;
  /** What each tab shows: the dataset counted with every filter applied
   *  except species, so the number is what pressing the tab gives you. */
  counts: Record<SpeciesFilter, number>;
  /** Which tabs exist at all, counted over the whole dataset. Separate from
   *  `counts` because a filter may empty a tab without deleting it; see the
   *  strip's own note below. Required rather than falling back to `counts`:
   *  the fallback silently turns a faceted count into a roster, which is the
   *  bug the two fields exist to prevent. */
  roster: Record<SpeciesFilter, number>;
  disabled?: boolean;
  fullWidth?: boolean;
}) {
  const { locale } = useI18n();
  const tabs: { value: SpeciesFilter; label: string; icon?: LucideIcon }[] = [
    { value: "all", label: LABELS[locale].all },
    ...SPECIES_TAB_ORDER.map((value) => ({
      value,
      label: LABELS[locale][value],
      icon: SPECIES_TAB_ICONS[value],
    })),
  ];

  const activeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    // A deep link (?vrsta=ostale) can mount straight into the active tab, and
    // if that tab sits past the fold of a scrolled 320px row the visitor never
    // sees what is selected. Nudge it into view whenever the selected tab
    // changes -- on mount for the deep-link case, and again for a later or
    // programmatic selection -- without stealing the page's own scroll
    // position: "nearest" on both axes only moves the horizontal strip, it
    // never scrolls the page to bring the row itself into view.
    // jsdom (unit tests) has no scrollIntoView; guarded rather than polyfilled
    // everywhere just for this one effect.
    activeRef.current?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [value]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [edgeFade, setEdgeFade] = useState({ left: false, right: false });
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const update = () => {
      setEdgeFade({
        left: el.scrollLeft > EDGE_SLACK_PX,
        right: el.scrollLeft + el.clientWidth < el.scrollWidth - EDGE_SLACK_PX,
      });
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    if (typeof ResizeObserver === "undefined") {
      return () => el.removeEventListener("scroll", update);
    }
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, [tabs.length]);

  return (
    // Five tabs plus the sheet trigger don't fit a 375px phone, and wrapping
    // cost a second row on a bar that is pinned to the top the whole time.
    // Scrolling keeps it one row tall at every width, in fullWidth mode too:
    // flex-1 tabs still overflow a 320px sheet once their labels are long
    // enough, so the strip needs the same scroll-and-fade escape hatch.
    <div
      ref={scrollRef}
      style={{
        maskImage: `linear-gradient(to right, ${
          edgeFade.left ? "transparent, black 1.5rem" : "black"
        }, ${edgeFade.right ? "black calc(100% - 1.5rem), transparent" : "black"} 100%)`,
      }}
      className={cn(
        // The vertical padding is what the tabs' touch overlays live in.
        // Scrolling sideways makes this a scroll box in both axes, and a
        // scroll box clips at its padding edge, so without the padding the
        // overlays are cut back to the height of the pills. The matching
        // negative margin keeps the row occupying its old height.
        "flex min-w-0 gap-1 overflow-x-auto no-scrollbar max-lg:-my-2 max-lg:py-2",
        fullWidth && "w-full",
      )}
    >
      {tabs.map(({ value: tab, label, icon: Icon }) => {
        // An empty dataset keeps all tabs (disabled); otherwise a species
        // the dataset does not hold disappears rather than leading to zero
        // results.
        //
        // The roster and not the count. These used to be one number, and the
        // moment the count became faceted they had to part: narrowing to
        // "samica" empties Ostale on a dataset whose only rabbit is male, and
        // an empty tab that vanishes takes the way back to the other species
        // with it. A tab reading 0 is not a dead end, it is the honest price
        // of the current filters and it stays pressable; the empty state on
        // the other side carries the way out.
        if (!disabled && tab !== "all" && roster[tab] === 0) {
          return null;
        }
        return (
          <button
            key={tab}
            ref={value === tab ? activeRef : undefined}
            type="button"
            onClick={() => onChange(tab)}
            disabled={disabled}
            aria-pressed={value === tab}
            // The pill stays 28px tall so the toolbar row keeps its height.
            // Below lg, which is the only place this copy of the tabs is
            // shown, the tap target grows to 44px around it. min-w-0 plus a
            // truncating label is what stops a long name from forcing the
            // flex-1 tab wider than the row has room for.
            className={cn(
              // opacity-50 and ring-3, which is what buttonVariants and
              // badgeVariants both use. This was the only disabled step in the
              // codebase at 40, and the only pressable thing in the bar with
              // no ring of its own at all.
              // px-2/gap-1 and not px-2.5/gap-1.5. The strip already ran 18px
              // past a 375px phone before Vse carried a number, and a number
              // is about 30 more. Tightening every tab buys back roughly what
              // the new one costs, so the strip overflows no further than it
              // did and "Ostale" is no worse off.
              "inline-flex min-w-0 items-center justify-center gap-1 rounded-ui px-2 py-1 text-sm outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 max-lg:tap-target",
              // fullWidth tabs need to shrink (and truncate) before the row
              // is allowed to overflow; the fixed toolbar copy never shrinks,
              // since a squeezed icon-only pill there would misread as a
              // different species.
              fullWidth ? "flex-1 py-1.5" : "shrink-0",
              value === tab
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {Icon && <Icon className="size-4 shrink-0" strokeWidth={1.75} aria-hidden />}
            <span className="min-w-0 truncate">{label}</span>
            {/* The species tabs answer "what is there" before they are
                pressed, and Vse now answers it too.
                
                It went without a number for as long as there was a separate
                result count beside the strip, because the two were one total
                written twice. Faceting settled which of them to keep: the
                count could only ever be this strip's sum, or the pressed
                tab's own number, so it was never saying anything the tabs did
                not. The tabs kept the numbers and the count gave up its row
                (animal-filters.tsx). On the Mačke tab, "Vse 22" is the one
                that earns its place: it says what going back gives, which is
                the same promise every other tab here makes.
                
                No opacity step on top of it: globals.css documents this exact
                trap next to --muted-foreground -- opacity-60 over an already
                muted tone measures 2.46:1, under AA for 12px text, so the
                token is used whole and stays quieter by contrast with the
                label alone, not by fading further past it. */}
            {!disabled && (
              <span className="shrink-0 text-xs tabular-nums">
                {counts[tab]}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
