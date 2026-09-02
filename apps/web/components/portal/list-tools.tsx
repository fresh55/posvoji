"use client";

import { useMemo } from "react";
import { LayoutList, Search } from "lucide-react";
import {
  STATUS_META,
  choiceCard,
  isPortalStatus,
} from "@/components/portal/portal-fields";
import { portalText } from "@/components/portal/portal-text";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { slugify } from "@/lib/animal-path";
import { PORTAL_STATUSES, type PortalStatus } from "@/lib/portal-api";
import { cn } from "@/lib/utils";

/**
 * All the tools read of a record: what they search and what they count. A
 * crawled animal and a manual listing both carry these four under the same
 * names, so both go through here as they are.
 */
export type PortalListEntry = {
  id: string;
  name: string | null;
  breed: string | null;
  status: string | null;
};

/**
 * The name a search matches on. slugify folds the diacritics away, so "zan"
 * finds "Žan" and "muc" finds "Mucka": a shelter typing on a phone keyboard
 * should not have to reach for č, š or ž. The breed rides along because it is
 * the other word staff actually remember an animal by.
 */
function haystack(animal: PortalListEntry): string {
  return slugify(`${animal.name ?? ""} ${animal.breed ?? ""}`);
}

/**
 * The list as the tools leave it. Both filters are ands: an empty query and a
 * null status each match everything, which is what "Vse" resets to.
 */
export function filterPortalAnimals<Entry extends PortalListEntry>(
  animals: Entry[],
  query: string,
  status: PortalStatus | null,
): Entry[] {
  const needle = slugify(query);
  if (!needle && !status) return animals;
  return animals.filter((animal) => {
    if (status && animal.status !== status) return false;
    return !needle || haystack(animal).includes(needle);
  });
}

/** How many animals carry each status, over the full list. */
function statusCounts(animals: PortalListEntry[]): Record<PortalStatus, number> {
  const counts = { available: 0, reserved: 0, adopted: 0, hold: 0 };
  for (const animal of animals) {
    if (isPortalStatus(animal.status)) counts[animal.status] += 1;
  }
  return counts;
}

function Chip({
  icon: Icon,
  label,
  count,
  selected,
  selectedClass,
  onClick,
}: {
  icon: typeof LayoutList;
  label: string;
  count: number;
  selected: boolean;
  selectedClass?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={choiceCard(
        selected,
        cn(
          "h-11 gap-2 px-2.5 text-xs font-medium",
          selected && selectedClass,
        ),
      )}
    >
      <Icon className="size-4" strokeWidth={1.75} aria-hidden />
      <span className="truncate">{label}</span>
      <span className="text-2xs tabular-nums opacity-70">{count}</span>
    </button>
  );
}

/**
 * Search and status chips over the shelter's own list. The counts are read off
 * the full list, never off what the filters left: a chip has to say how many
 * animals it would show, or the numbers move under the hand that is using
 * them. A status with no animals is not offered, because tapping it could only
 * ever empty the list.
 */
export function PortalListTools({
  animals,
  query,
  onQueryChange,
  status,
  onStatusChange,
}: {
  /** The full list, not the filtered one. */
  animals: PortalListEntry[];
  query: string;
  onQueryChange: (query: string) => void;
  status: PortalStatus | null;
  onStatusChange: (status: PortalStatus | null) => void;
}) {
  const counts = useMemo(() => statusCounts(animals), [animals]);

  return (
    <div className="space-y-2.5">
      <div className="relative">
        <Label htmlFor="portal-search" className="sr-only">
          {portalText.searchLabel}
        </Label>
        <Search
          aria-hidden
          strokeWidth={1.75}
          className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          id="portal-search"
          type="search"
          autoComplete="off"
          placeholder={portalText.searchPlaceholder}
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          className="h-11 pl-8"
        />
      </div>

      <div
        role="group"
        aria-label={portalText.filterLegend}
        className="flex flex-wrap gap-1.5"
      >
        <Chip
          icon={LayoutList}
          label={portalText.statusAll}
          count={animals.length}
          selected={status === null}
          onClick={() => onStatusChange(null)}
        />
        {PORTAL_STATUSES.map((option) => {
          const selected = status === option;
          // A zero count is a dead end, but the chip that is currently on
          // stays on screen so the filter can be switched back off.
          if (counts[option] === 0 && !selected) return null;
          const meta = STATUS_META[option];
          return (
            <Chip
              key={option}
              icon={meta.icon}
              label={meta.label}
              count={counts[option]}
              selected={selected}
              selectedClass={meta.selected}
              onClick={() => onStatusChange(selected ? null : option)}
            />
          );
        })}
      </div>
    </div>
  );
}
