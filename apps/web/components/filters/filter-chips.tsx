"use client";

import { ListFilter, X } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { cn } from "@/lib/utils";

export type Chip = { key: string; label: string; onRemove: () => void };

export function FilterChips({
  chips,
  onClearAll,
  className,
}: {
  chips: Chip[];
  onClearAll: () => void;
  className?: string;
}) {
  const { messages, t } = useI18n();
  if (chips.length === 0) return null;

  return (
    <section
      aria-label={messages.activeFilters}
      className={cn("flex items-center gap-2", className)}
    >
      {/* Below md this used to disappear outright, leaving the row a bare
          scroller with no word for what it held. It now stays, just
          shortened to an icon: the full "Aktivni filtri" text returns at md,
          where there is room for it. The count is aria-hidden either way,
          because the section's own aria-label already carries the same
          words for anyone not reading it visually. */}
      <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
        <ListFilter className="size-3.5 md:hidden" aria-hidden />
        <span className="hidden md:inline">{messages.activeFilters}</span>
        <span aria-hidden className="tabular-nums">
          {chips.length}
        </span>
      </span>

      {/* The vertical padding holds the remove buttons' tap targets, which
          this scroll box would otherwise clip to the height of the chips.
          The negative margin gives the row its old height back. */}
      <div className="min-w-0 flex-1 overflow-x-auto no-scrollbar max-md:-my-2.5 max-md:py-2.5">
        <div className="flex w-max items-center gap-3 md:gap-1.5 sm:w-auto sm:flex-wrap">
          {chips.map(({ key, label, onRemove }) => (
            // Below md the remove button grows to a real 44px square instead
            // of an invisible overlay, so the chip needs the matching height
            // to hold it without clipping. An overlay here would reach past
            // the chip's own edge and into the next one's row-gap; a real
            // target the same size cannot, because the gap keeps the boxes
            // themselves apart.
            <span
              key={key}
              className="inline-flex shrink-0 items-center rounded-full border border-border bg-background pl-2.5 text-xs text-foreground md:h-7 max-md:min-h-11"
            >
              {label}
              <button
                type="button"
                onClick={onRemove}
                aria-label={t("removeFilter", { label })}
                // The circle stays 24px at md+; below it the button itself is
                // the tap target, not a layer drawn over it.
                className="ml-0.5 grid size-6 shrink-0 place-items-center rounded-full text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground active:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 max-md:size-11"
              >
                <X className="size-3" strokeWidth={2} aria-hidden />
              </button>
            </span>
          ))}
        </div>
      </div>

      {/* A gap plus a border, not just margin: an overscroll flick that runs
          out of chips to eat now hits a visible seam before it can reach
          Počisti, instead of the two controls reading as one continuous
          strip. */}
      <button
        type="button"
        onClick={onClearAll}
        aria-label={messages.clearFilters}
        className="ml-1 h-7 shrink-0 rounded-ui border-l border-border pl-2.5 text-xs text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground active:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 max-md:tap-target"
      >
        {messages.clear}
      </button>
    </section>
  );
}
