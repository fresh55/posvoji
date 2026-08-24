"use client";

import { type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { type SpeciesFilter } from "@/lib/filters";
import { SPECIES_ORDER } from "@/lib/species";
import { useI18n } from "@/components/i18n-provider";
import { SPECIES_ICONS } from "@/lib/animal-icons";
import { cn } from "@/lib/utils";

// The row scrolls sideways, so the fade needs a left/right mask; the shared
// fade-scroll utility only builds a top/bottom one for vertical lists (see
// filter-sidebar.tsx), so this is its horizontal counterpart, kept local
// since only this row needs it. A container that fits gets no mask at all.
const EDGE_SLACK_PX = 8;

const LABELS: Record<"sl" | "en", Record<SpeciesFilter, string>> = {
  sl: { all: "Vse", dog: "Psi", cat: "Mačke", rabbit: "Zajčki", other: "Ostale" },
  en: { all: "All", dog: "Dogs", cat: "Cats", rabbit: "Rabbits", other: "Other" },
};

export function SpeciesTabs({
  value,
  onChange,
  counts,
  disabled = false,
  fullWidth = false,
}: {
  value: SpeciesFilter;
  onChange: (species: SpeciesFilter) => void;
  counts: Record<SpeciesFilter, number>;
  disabled?: boolean;
  fullWidth?: boolean;
}) {
  const { locale } = useI18n();
  const tabs: { value: SpeciesFilter; label: string; icon?: LucideIcon }[] = [
    { value: "all", label: LABELS[locale].all },
    ...SPECIES_ORDER.map((value) => ({
      value,
      label: LABELS[locale][value],
      icon: SPECIES_ICONS[value],
    })),
  ];

  const activeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    // A deep link (?vrsta=ostale) can mount straight into the active tab, and
    // if that tab sits past the fold of a scrolled 320px row the visitor never
    // sees what is selected. Nudge it into view once, without stealing the
    // page's own scroll position.
    // jsdom (unit tests) has no scrollIntoView; guarded rather than polyfilled
    // everywhere just for this one effect.
    activeRef.current?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        // An empty dataset keeps all tabs (disabled); otherwise empty
        // categories disappear rather than leading to zero results.
        if (!disabled && tab !== "all" && counts[tab] === 0) return null;
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
              "inline-flex min-w-0 items-center justify-center gap-1.5 rounded-ui px-2.5 py-1 text-sm transition-colors disabled:opacity-40 max-lg:tap-target",
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
          </button>
        );
      })}
    </div>
  );
}
