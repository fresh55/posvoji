"use client";

import {
  Check,
  Mars,
  PawPrint,
  Venus,
  type LucideIcon,
} from "lucide-react";
import { LazyMotion, domAnimation, m, useReducedMotion } from "motion/react";
import { AgeGrowthControl } from "@/components/filters/age-growth-control";
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
  const shouldReduceMotion = useReducedMotion();

  return (
    <LazyMotion features={domAnimation}>
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
              className={cn(
                "group relative h-[5.25rem] min-w-0 flex-1 flex-col gap-1 overflow-hidden rounded-lg border px-2 py-2 text-center transition-[border-color,background-color,box-shadow,transform,color] duration-150 disabled:opacity-35",
                checked
                  ? "border-[#2f6f4e]/25 bg-[#2f6f4e]/[0.055] text-foreground shadow-xs data-[state=on]:bg-[#2f6f4e]/[0.055]"
                  : "border-transparent text-muted-foreground hover:-translate-y-px hover:border-border hover:bg-muted/50 hover:text-foreground data-[state=off]:bg-transparent",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "absolute right-2 top-2 grid size-4.5 place-items-center rounded-sm border transition-colors",
                  checked
                    ? "border-[#2f6f4e] bg-[#2f6f4e] text-white"
                    : "border-muted-foreground/45 text-transparent",
                )}
              >
                <m.span
                  initial={false}
                  animate={{
                    opacity: checked ? 1 : 0,
                    scale: checked ? 1 : 0.55,
                  }}
                  transition={
                    shouldReduceMotion
                      ? { duration: 0 }
                      : checked
                        ? { type: "spring", stiffness: 520, damping: 28 }
                        : { duration: 0.1 }
                  }
                >
                  <Check className="size-3" strokeWidth={2.6} />
                </m.span>
              </span>

              <m.span
                aria-hidden
                className="flex items-center justify-center"
                initial={false}
                animate={{
                  scale: checked ? 1 : 0.88,
                  rotate: checked ? 0 : value === "male" ? -3 : 3,
                  y: checked ? 0 : 1,
                }}
                transition={
                  shouldReduceMotion
                    ? { duration: 0 }
                    : { type: "spring", stiffness: 420, damping: 24 }
                }
              >
                <Icon
                  className={cn(
                    "size-6 transition-colors",
                    checked ? "text-[#2f7d50]" : "text-muted-foreground",
                  )}
                  strokeWidth={1.65}
                />
              </m.span>
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
    </LazyMotion>
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

  if (group === "sex") {
    return (
      <section>
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {groupLabel(group, locale)}
        </h3>
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
