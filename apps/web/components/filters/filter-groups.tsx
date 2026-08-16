"use client";

import {
  Mars,
  PawPrint,
  Shrub,
  Sprout,
  TreeDeciduous,
  Venus,
  type LucideIcon,
} from "lucide-react";
import {
  groupLabel,
  type FilterOption,
  type Filters,
  type MultiGroup,
  type ToggleDef,
  type ToggleKey,
} from "@/lib/filters";
import { useI18n } from "@/components/i18n-provider";
import { cn } from "@/lib/utils";

// Paw and plant size reinforce the ordered choices. Sex only needs distinct
// symbols.
const ICONS: Record<string, { icon: LucideIcon; className: string }> = {
  "sex:male": { icon: Mars, className: "size-4" },
  "sex:female": { icon: Venus, className: "size-4" },
  "age:mladicek": { icon: Sprout, className: "size-3.5" },
  "age:odrasel": { icon: Shrub, className: "size-4.5" },
  "age:senior": { icon: TreeDeciduous, className: "size-5" },
  "size:small": { icon: PawPrint, className: "size-3" },
  "size:medium": { icon: PawPrint, className: "size-4" },
  "size:large": { icon: PawPrint, className: "size-5" },
};

function optionIcon(group: MultiGroup, value: string) {
  return ICONS[`${group}:${value}`];
}

type GroupProps = {
  group: CardGroup;
  options: FilterOption[];
  counts: Map<string, number>;
  selected: string[];
  onToggle: (value: string) => void;
};

export type CardGroup = Exclude<MultiGroup, "shelter">;

// Everything but zavetišče is a short run of options you weigh against each
// other, so they all get the card. Only the column count differs.
const CARD_COLS: Record<CardGroup, string> = {
  sex: "grid-cols-2",
  age: "grid-cols-3",
  size: "grid-cols-3",
};

// A zero-count option is a dead end, but an active selection is never locked
// out of being unchecked.
function isDead(count: number, checked: boolean): boolean {
  return count === 0 && !checked;
}

// One card for every option in every group: a single selected state to read,
// instead of one dialect per group in a 14rem column.
function OptionCards({
  group,
  options,
  counts,
  selected,
  onToggle,
}: Omit<GroupProps, "group"> & { group: CardGroup }) {
  return (
    <div className={cn("grid gap-1.5", CARD_COLS[group])}>
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
            {/* Shared floor, so both ramps read as growing rather than
                floating. */}
            <span className="flex h-5 items-end">
              {iconDef && (
                <iconDef.icon
                  className={iconDef.className}
                  strokeWidth={1.75}
                  aria-hidden
                />
              )}
            </span>
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

// Yes/no properties: pills that look switched on, not options to compare.
export function TogglePills({
  toggles,
  counts,
  selected,
  onToggle,
}: {
  toggles: ToggleDef[];
  counts: Map<string, number>;
  selected: ToggleKey[];
  onToggle: (key: ToggleKey) => void;
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

function FilterGroup({ group, ...rest }: GroupProps) {
  const { locale } = useI18n();

  return (
    <section>
      <h3 className="mb-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {groupLabel(group, locale)}
      </h3>
      <OptionCards group={group} {...rest} />
    </section>
  );
}

// The desktop sidebar and the mobile sheet frame these differently but show the
// same controls, so the list lives here and each frame supplies only its chrome.
export function FilterGroupList({
  filters,
  groups,
  counts,
  toggles,
  toggleTally,
  onToggle,
  onToggleProperty,
}: {
  filters: Filters;
  groups: { group: CardGroup; options: FilterOption[] }[];
  counts: Record<MultiGroup, Map<string, number>>;
  toggles: ToggleDef[];
  toggleTally: Map<string, number>;
  onToggle: (group: MultiGroup, value: string) => void;
  onToggleProperty: (key: ToggleKey) => void;
}) {
  const { messages } = useI18n();
  return (
    <>
      {groups.map(({ group, options }) => (
        <FilterGroup
          key={group}
          group={group}
          options={options}
          counts={counts[group]}
          selected={filters[group]}
          onToggle={(value) => onToggle(group, value)}
        />
      ))}

      {toggles.length > 0 && (
        <section>
          <h3 className="mb-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {messages.health}
          </h3>
          <TogglePills
            toggles={toggles}
            counts={toggleTally}
            selected={filters.toggles}
            onToggle={onToggleProperty}
          />
        </section>
      )}
    </>
  );
}
