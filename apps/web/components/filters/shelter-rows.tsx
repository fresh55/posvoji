"use client";

import { useRef, type KeyboardEvent, type RefObject } from "react";
import { Check } from "lucide-react";
import { formatKm } from "@/lib/geo";
import { cn } from "@/lib/utils";

export type ShelterRow = {
  value: string;
  label: string;
  city?: string;
  km?: number;
};

// The list is not a fallback for narrow screens. It is the accessible path, it
// always holds every shelter including the ones no marker could be placed for,
// and its rows are the full size target for anyone who cannot hit a region.
// Both the sidebar and the expanded map show the same rows.
export function ShelterRows({
  rows,
  counts,
  selected,
  onToggle,
  refs,
  className,
  highlighted,
  onHoverRow,
  onExitTop,
  lessThanOneKm,
}: {
  rows: ShelterRow[];
  counts: Map<string, number>;
  selected: string[];
  onToggle: (value: string) => void;
  refs?: RefObject<Map<string, HTMLButtonElement>>;
  className?: string;
  /** Values lit up because their marker is hovered on the map. */
  highlighted?: string[];
  /** Fired on row pointer enter/leave, so the map can highlight the matching
   *  marker and region. Null on leave. */
  onHoverRow?: (value: string | null) => void;
  /** ArrowUp on the first row leaves the list upward, so the search box and
   *  the rows read as one keyboard surface. */
  onExitTop?: () => void;
  /** The words for a sub-kilometre distance, in the reader's language. The
   *  rows take it as a prop rather than reading the locale themselves, which
   *  keeps them renderable outside a provider. */
  lessThanOneKm?: string;
}) {
  const localRefs = useRef(new Map<string, HTMLButtonElement>());

  // Arrow keys walk the enabled rows only; a disabled row cannot take focus,
  // so skipping it is what keeps the walk from dead-ending.
  const moveFocus = (event: KeyboardEvent, value: string) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const enabled = rows.filter(
      (row) =>
        (counts.get(row.value) ?? 0) > 0 || selected.includes(row.value),
    );
    const index = enabled.findIndex((row) => row.value === value);
    if (index < 0) return;
    if (event.key === "ArrowUp" && index === 0) {
      onExitTop?.();
      return;
    }
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? enabled.length - 1
          : event.key === "ArrowUp"
            ? index - 1
            : Math.min(index + 1, enabled.length - 1);
    localRefs.current.get(enabled[next].value)?.focus();
  };

  return (
    <div className={cn("space-y-0.5", className)}>
      {rows.map(({ value, label, city, km }) => {
        const count = counts.get(value) ?? 0;
        const checked = selected.includes(value);
        const isHighlighted = highlighted?.includes(value) ?? false;
        const sublabel = [
          city,
          km === undefined ? undefined : formatKm(km, lessThanOneKm),
        ]
          .filter(Boolean)
          .join(" · ");
        return (
          <button
            key={value}
            type="button"
            ref={(node) => {
              if (node) localRefs.current.set(value, node);
              else localRefs.current.delete(value);
              if (!refs) return;
              if (node) refs.current.set(value, node);
              else refs.current.delete(value);
            }}
            onClick={() => onToggle(value)}
            onKeyDown={(event) => moveFocus(event, value)}
            onPointerEnter={() => onHoverRow?.(value)}
            onPointerLeave={() => onHoverRow?.(null)}
            disabled={count === 0 && !checked}
            aria-pressed={checked}
            data-highlighted={isHighlighted || undefined}
            className={cn(
              "flex w-full items-center gap-2 rounded-ui px-2 py-1.5 text-left transition-colors disabled:opacity-40",
              checked
                ? "bg-muted"
                : isHighlighted
                  ? "bg-muted/50"
                  : "hover:bg-muted/50",
            )}
          >
            {/* Always laid out, so selecting a row doesn't shift the list. */}
            <Check
              className={cn("size-3.5 shrink-0", !checked && "opacity-0")}
              strokeWidth={2.25}
              aria-hidden
            />
            <span className="min-w-0 flex-1">
              <span
                className={cn(
                  "block truncate text-sm",
                  !checked && "text-muted-foreground",
                )}
              >
                {label}
              </span>
              {sublabel && (
                <span className="block truncate text-[11px] text-muted-foreground/80">
                  {sublabel}
                </span>
              )}
            </span>
            <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
