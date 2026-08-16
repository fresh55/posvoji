"use client";

import {
  Mars,
  PawPrint,
  Venus,
  type LucideIcon,
} from "lucide-react";
import { AgeGrowthControl } from "@/components/filters/age-growth-control";
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
  group: CardGroup;
  ageLayout: "sidebar" | "sheet";
  options: FilterOption[];
  counts: Map<string, number>;
  selected: string[];
  onToggle: (value: string) => void;
  onToggleMany: (values: string[]) => void;
};

export type CardGroup = Exclude<MultiGroup, "shelter">;
type OptionCardGroup = Exclude<CardGroup, "age">;

const CARD_COLS: Record<OptionCardGroup, string> = {
  sex: "grid-cols-2",
  size: "grid-cols-3",
};

// A zero-count option is a dead end, but an active selection is never locked
// out of being unchecked.
function isDead(count: number, checked: boolean): boolean {
  return count === 0 && !checked;
}

function OptionCards({
  group,
  options,
  counts,
  selected,
  onToggle,
}: Omit<GroupProps, "group" | "ageLayout" | "onToggleMany"> & {
  group: OptionCardGroup;
}) {
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
              "flex flex-col items-center gap-1 rounded-lg border border-transparent px-1 py-2.5 transition-colors disabled:opacity-40",
              checked
                ? "border-foreground/20 bg-muted text-foreground"
                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
            )}
          >
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

  if (group === "age") {
    return (
      <AgeGrowthControl
        options={rest.options}
        counts={rest.counts}
        selected={rest.selected}
        onToggle={rest.onToggle}
        onToggleMany={rest.onToggleMany}
        layout={rest.ageLayout}
      />
    );
  }

  return (
    <section>
      <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {groupLabel(group, locale)}
      </h3>
      <OptionCards
        group={group}
        options={rest.options}
        counts={rest.counts}
        selected={rest.selected}
        onToggle={rest.onToggle}
      />
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
  onToggleMany,
  onToggleProperty,
  ageLayout = "sidebar",
}: {
  filters: Filters;
  groups: { group: CardGroup; options: FilterOption[] }[];
  counts: Record<MultiGroup, Map<string, number>>;
  toggles: ToggleDef[];
  toggleTally: Map<string, number>;
  onToggle: (group: MultiGroup, value: string) => void;
  onToggleMany: (group: MultiGroup, values: string[]) => void;
  onToggleProperty: (key: ToggleKey) => void;
  ageLayout?: "sidebar" | "sheet";
}) {
  const { messages } = useI18n();
  return (
    <>
      {groups.map(({ group, options }) => (
        <FilterGroup
          key={group}
          group={group}
          ageLayout={ageLayout}
          options={options}
          counts={counts[group]}
          selected={filters[group]}
          onToggle={(value) => onToggle(group, value)}
          onToggleMany={(values) => onToggleMany(group, values)}
        />
      ))}

      {toggles.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
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
