"use client";

import {
  Mars,
  PawPrint,
  ScanLine,
  Scissors,
  ShieldCheck,
  Syringe,
  TestTubeDiagonal,
  Venus,
  type LucideIcon,
} from "lucide-react";
import { AgeGrowthControl } from "@/components/filters/age-growth-control";
import type { FilterActionContract } from "@/components/filters/filter-contract";
import { FilterSectionHeader } from "@/components/filters/filter-section-header";
import {
  FilterSelectionMark,
  filterCardVariants,
} from "@/components/filters/filter-card";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group";
import {
  groupLabel,
  type FilterOption,
  type Filters,
  type MultiGroup,
  type ToggleDef,
  type ToggleKey,
} from "@/lib/filters";
import { useI18n } from "@/components/i18n-provider";
import { animalCount } from "@/lib/labels";
import { cn } from "@/lib/utils";

const ICONS: Record<string, { icon: LucideIcon; className: string }> = {
  "size:small": { icon: PawPrint, className: "size-3" },
  "size:medium": { icon: PawPrint, className: "size-4" },
  "size:large": { icon: PawPrint, className: "size-5" },
};

const SEX_ICONS: Record<string, LucideIcon> = {
  male: Mars,
  female: Venus,
};

const HEALTH_ICONS: Record<ToggleKey, LucideIcon> = {
  sterilizacija: Scissors,
  cepljenje: Syringe,
  cip: ScanLine,
  "brez-fiv": ShieldCheck,
  "brez-felv": TestTubeDiagonal,
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
type OptionCardGroup = Exclude<CardGroup, "age" | "sex">;

const CARD_COLS: Record<OptionCardGroup, string> = {
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
  const { locale } = useI18n();
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
              aria-label={`${label}, ${animalCount(count, locale)}`}
              className={filterCardVariants({
                selected: checked,
                className:
                  "flex min-h-[4.75rem] flex-col items-center justify-center gap-1 px-1.5 py-2 text-center",
              })}
            >
              <FilterSelectionMark
                checked={checked}
                className="absolute right-1.5 top-1.5"
              />
              <span aria-hidden className="flex h-5 items-end">
                {iconDef && (
                  <iconDef.icon
                    className={iconDef.className}
                    strokeWidth={1.75}
                  />
                )}
              </span>
              <span className={cn("text-xs", checked && "font-medium")}>
                {label}
              </span>
              <span className="text-[11px] tabular-nums text-muted-foreground">
                {count}
              </span>
            </button>
          );
        })}
    </div>
  );
}

function changedValue(selected: string[], nextSelected: string[]) {
  return (
    nextSelected.find((value) => !selected.includes(value)) ??
    selected.find((value) => !nextSelected.includes(value))
  );
}

function SexCards({
  options,
  counts,
  selected,
  onToggle,
}: Omit<GroupProps, "group" | "ageLayout" | "onToggleMany">) {
  const { locale } = useI18n();
  return (
    <ToggleGroup
        type="multiple"
        value={selected}
        onValueChange={(nextSelected) => {
          const changed = changedValue(selected, nextSelected);
          if (changed) onToggle(changed);
        }}
        aria-label={groupLabel("sex", locale)}
        spacing={1.5}
        className="grid w-full grid-cols-2 items-stretch"
      >
        {options.map(({ value, label }) => {
          const count = counts.get(value) ?? 0;
          const checked = selected.includes(value);
          const Icon = SEX_ICONS[value];
          if (!Icon) return null;

          return (
            <ToggleGroupItem
              key={value}
              value={value}
              disabled={isDead(count, checked)}
              aria-label={`${label}, ${animalCount(count, locale)}`}
              className={filterCardVariants({
                selected: checked,
                className:
                  "h-[4.75rem] min-w-0 flex-1 flex-col gap-1 px-2 py-2 text-center",
              })}
            >
              <FilterSelectionMark
                checked={checked}
                className="absolute right-2 top-2"
              />

              <span aria-hidden className="flex items-center justify-center">
                <Icon
                  className={cn(
                    "size-6 transition-colors",
                    checked
                      ? "text-[var(--filter-accent-strong)]"
                      : "text-muted-foreground",
                  )}
                  strokeWidth={1.65}
                />
              </span>
              <span className={cn("text-xs", checked && "font-medium")}>
                {label}
              </span>
              <span className="text-[11px] tabular-nums text-muted-foreground">
                {count}
              </span>
            </ToggleGroupItem>
          );
        })}
    </ToggleGroup>
  );
}

function HealthToggleCards({
  toggles,
  counts,
  selected,
  onToggle,
  layout = "sidebar",
}: {
  toggles: ToggleDef[];
  counts: Map<string, number>;
  selected: ToggleKey[];
  onToggle: (key: ToggleKey) => void;
  layout?: "sidebar" | "sheet";
}) {
  const { locale } = useI18n();
  return (
    <div
        className={cn(
          "grid gap-1.5",
          layout === "sheet" ? "grid-cols-3" : "grid-cols-1",
        )}
      >
        {toggles.map(({ key, label }) => {
          const count = counts.get(key) ?? 0;
          const checked = selected.includes(key);
          const Icon = HEALTH_ICONS[key];

          return (
            <button
              key={key}
              type="button"
              onClick={() => onToggle(key)}
              disabled={isDead(count, checked)}
              aria-pressed={checked}
              aria-label={`${label}, ${animalCount(count, locale)}`}
              className={filterCardVariants({
                selected: checked,
                className: cn(
                  "flex",
                  layout === "sheet"
                    ? "min-h-[4.75rem] flex-col items-center justify-center gap-0.5 px-1.5 py-2 text-center"
                    : "h-11 flex-row items-center justify-start gap-2.5 px-2.5 py-1.5 pr-9 text-left",
                ),
              })}
            >
              <FilterSelectionMark
                checked={checked}
                className={cn(
                  layout === "sheet"
                    ? "absolute right-1.5 top-1.5"
                    : "absolute right-2.5 top-1/2 -translate-y-1/2",
                )}
              />

              <span
                aria-hidden
                className={cn(
                  "relative grid shrink-0 place-items-center",
                  layout === "sheet" ? "size-7" : "size-7.5",
                )}
              >
                <span
                  className={cn(
                    "absolute rounded-full bg-muted-foreground/10 transition-opacity duration-150",
                    layout === "sheet" ? "size-7" : "size-7.5",
                    !checked && "opacity-0",
                  )}
                />
                <span className="relative flex items-center justify-center">
                  <Icon
                    className={cn(
                      "size-5 transition-colors duration-150",
                      checked
                        ? "text-[var(--filter-accent-strong)]"
                        : "text-muted-foreground",
                    )}
                    strokeWidth={1.65}
                  />
                </span>
              </span>

              {layout === "sheet" ? (
                <>
                  <span
                    className={cn(
                      "mt-0.5 max-w-full truncate text-xs",
                      checked && "font-medium",
                    )}
                  >
                    {label}
                  </span>
                  <span className="text-[11px] tabular-nums text-muted-foreground">
                    {count}
                  </span>
                </>
              ) : (
                <span className="flex min-w-0 flex-1 items-baseline justify-between gap-2">
                  <span
                    className={cn(
                      "truncate text-xs",
                      checked && "font-medium",
                    )}
                  >
                    {label}
                  </span>
                  <span className="w-8 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
                    {count}
                  </span>
                </span>
              )}
            </button>
          );
        })}
    </div>
  );
}

function FilterGroup({ group, ...rest }: GroupProps) {
  const { locale, messages } = useI18n();

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

  if (group === "sex") {
    return (
      <section>
        <FilterSectionHeader
          label={groupLabel(group, locale)}
          active={rest.selected.length > 0}
          onReset={() => rest.onToggleMany(rest.selected)}
          resetAriaLabel={messages.resetSexFilters}
        />
        <SexCards
          options={rest.options}
          counts={rest.counts}
          selected={rest.selected}
          onToggle={rest.onToggle}
        />
      </section>
    );
  }

  return (
    <section>
      <FilterSectionHeader
        label={groupLabel(group, locale)}
        active={rest.selected.length > 0}
        onReset={() => rest.onToggleMany(rest.selected)}
        resetAriaLabel={messages.resetSizeFilters}
      />
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
  onToggleManyProperties,
  ageLayout = "sidebar",
}: {
  filters: Filters;
  groups: { group: CardGroup; options: FilterOption[] }[];
  counts: Record<MultiGroup, Map<string, number>>;
  toggles: ToggleDef[];
  toggleTally: Map<string, number>;
  ageLayout?: "sidebar" | "sheet";
} & FilterActionContract) {
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
          <FilterSectionHeader
            label={messages.health}
            active={filters.toggles.length > 0}
            onReset={() => onToggleManyProperties(filters.toggles)}
            resetAriaLabel={messages.resetHealthFilters}
          />
          <p className="mb-2 text-[11px] leading-snug text-muted-foreground">
            {messages.healthFilterHint}
          </p>
          <HealthToggleCards
            toggles={toggles}
            counts={toggleTally}
            selected={filters.toggles}
            onToggle={onToggleProperty}
            layout={ageLayout}
          />
        </section>
      )}
    </>
  );
}
