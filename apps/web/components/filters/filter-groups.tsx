"use client";

import { Check, Mars, PawPrint, Venus, type LucideIcon } from "lucide-react";
import {
  GROUP_LABELS,
  type FilterOption,
  type MultiGroup,
} from "@/lib/filters";
import { cn } from "@/lib/utils";

// Only where the icon is the data: the paw grows with the animal. Age carries
// its meaning through order instead, so it takes no icon.
const ICONS: Record<string, { icon: LucideIcon; className: string }> = {
  "sex:male": { icon: Mars, className: "size-4" },
  "sex:female": { icon: Venus, className: "size-4" },
  "size:small": { icon: PawPrint, className: "size-3" },
  "size:medium": { icon: PawPrint, className: "size-4" },
  "size:large": { icon: PawPrint, className: "size-5" },
};

function optionIcon(group: MultiGroup, value: string) {
  return ICONS[`${group}:${value}`];
}

type GroupProps = {
  group: MultiGroup;
  options: FilterOption[];
  counts: Map<string, number>;
  selected: string[];
  onToggle: (value: string) => void;
};

// A zero-count option is a dead end, but an active selection is never locked
// out of being unchecked.
function isDead(count: number, checked: boolean): boolean {
  return count === 0 && !checked;
}

// Velikost only: the paws are meant to be compared against each other, which
// needs the room a card gives and a segment doesn't.
function OptionCards({ group, options, counts, selected, onToggle }: GroupProps) {
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {options.map(({ value, label }) => {
        const count = counts.get(value) ?? 0;
        const checked = selected.includes(value);
        const iconDef = optionIcon(group, value);
        return (
          <button
            key={value}
            type="button"
            onClick={() => onToggle(value)}
            disabled={isDead(count, checked)}
            aria-pressed={checked}
            className={cn(
              "flex flex-col items-center gap-1 rounded-lg border border-transparent px-1 py-3 transition-colors disabled:opacity-40",
              checked
                ? "border-foreground/20 bg-muted text-foreground"
                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
            )}
          >
            {iconDef && (
              // Shared floor, so the paws read as growing rather than floating.
              <span className="flex h-5 items-end">
                <iconDef.icon
                  className={iconDef.className}
                  strokeWidth={1.75}
                  aria-hidden
                />
              </span>
            )}
            <span className="text-xs">{label}</span>
            <span className="text-[11px] tabular-nums text-muted-foreground">
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// Spol is a binary and starost is ordinal — both are "pick from a short run",
// which a segmented strip says in one border instead of three.
function SegmentStrip({ group, options, counts, selected, onToggle }: GroupProps) {
  return (
    <div className="flex overflow-hidden rounded-lg border">
      {options.map(({ value, label }, i) => {
        const count = counts.get(value) ?? 0;
        const checked = selected.includes(value);
        const iconDef = optionIcon(group, value);
        return (
          <button
            key={value}
            type="button"
            onClick={() => onToggle(value)}
            disabled={isDead(count, checked)}
            aria-pressed={checked}
            className={cn(
              "flex-1 px-1 py-2 transition-colors disabled:opacity-40",
              i > 0 && "border-l",
              checked
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
            )}
          >
            <span className="flex items-center justify-center gap-1 text-xs">
              {iconDef && (
                <iconDef.icon
                  className={iconDef.className}
                  strokeWidth={1.75}
                  aria-hidden
                />
              )}
              {label}
            </span>
            <span className="block text-[11px] tabular-nums opacity-60">
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// Yes/no properties: pills that look switched on, not options to compare.
export function TogglePills({
  toggles,
  counts,
  selected,
  onToggle,
}: {
  toggles: { key: string; label: string }[];
  counts: Map<string, number>;
  selected: string[];
  onToggle: (key: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {toggles.map(({ key, label }) => {
        const count = counts.get(key) ?? 0;
        const checked = selected.includes(key);
        return (
          <button
            key={key}
            type="button"
            onClick={() => onToggle(key)}
            disabled={isDead(count, checked)}
            aria-pressed={checked}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors disabled:opacity-40",
              checked
                ? "border-foreground bg-foreground text-background"
                : "text-muted-foreground hover:border-foreground/25 hover:text-foreground",
            )}
          >
            {label}
            <span className="text-[11px] tabular-nums opacity-60">{count}</span>
          </button>
        );
      })}
    </div>
  );
}

// Shelters keep arriving, so they stay a quiet list that scales past twenty
// names instead of a wall of boxes.
function ShelterRows({ options, counts, selected, onToggle }: GroupProps) {
  return (
    // No negative margin: the sidebar scrolls vertically, and any child wider
    // than its padding box turns that into a horizontal scrollbar too.
    <div className="space-y-0.5">
      {options.map(({ value, label, sublabel }) => {
        const count = counts.get(value) ?? 0;
        const checked = selected.includes(value);
        return (
          <button
            key={value}
            type="button"
            onClick={() => onToggle(value)}
            disabled={isDead(count, checked)}
            aria-pressed={checked}
            className={cn(
              "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors disabled:opacity-40",
              checked ? "bg-muted" : "hover:bg-muted/50",
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

// Shared by the desktop sidebar and the mobile sheet so both read the same.
export function FilterGroup(props: GroupProps) {
  return (
    <section>
      <h3 className="mb-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {GROUP_LABELS[props.group]}
      </h3>
      {props.group === "shelter" ? (
        <ShelterRows {...props} />
      ) : props.group === "size" ? (
        <OptionCards {...props} />
      ) : (
        <SegmentStrip {...props} />
      )}
    </section>
  );
}
