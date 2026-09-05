"use client";

import { useMemo } from "react";
import { ClipboardList, LayoutList, Search } from "lucide-react";
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
 * What one chip filters the list down to. The four statuses are a property of
 * the record; "review" is not, because whether an animal still waits for the
 * shelter is a question about the crawl's answers and the blanks left in
 * them. The caller answers it with a predicate.
 */
export type PortalListFilter = PortalStatus | "review";

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
 * null filter each match everything, which is what "Vse" resets to.
 *
 * A caller with no needsReview has nothing to review, so the "review" filter
 * leaves that list empty rather than whole. Only the crawled list hands the
 * predicate in; a manual shelter writes its own records and is never offered
 * the chip.
 */
export function filterPortalAnimals<Entry extends PortalListEntry>(
  animals: Entry[],
  query: string,
  filter: PortalListFilter | null,
  needsReview?: (entry: Entry) => boolean,
): Entry[] {
  const needle = slugify(query);
  if (!needle && !filter) return animals;
  return animals.filter((animal) => {
    if (filter === "review") {
      if (!needsReview?.(animal)) return false;
    } else if (filter && animal.status !== filter) {
      return false;
    }
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
 * Search and filter chips over the shelter's own list. The counts are read off
 * the full list, never off what the filters left: a chip has to say how many
 * animals it would show, or the numbers move under the hand that is using
 * them. A status with no animals is not offered, because tapping it could only
 * ever empty the list.
 *
 * "Za pregled" sits second, right after "Vse", because it is the only chip
 * that names work rather than a state: the animals whose status is still the
 * crawl's reading, or that leave one of the adopter's filters blank. It keeps
 * the plain green selected state of every other chip, and it is offered only
 * to a list that has a count for it, so a manual shelter never sees it.
 */
export function PortalListTools({
  animals,
  query,
  onQueryChange,
  filter,
  onFilterChange,
  reviewCount,
}: {
  /** The full list, not the filtered one. */
  animals: PortalListEntry[];
  query: string;
  onQueryChange: (query: string) => void;
  filter: PortalListFilter | null;
  onFilterChange: (filter: PortalListFilter | null) => void;
  /** Left out by a list that has nothing to review, which hides the chip. */
  reviewCount?: number;
}) {
  const counts = useMemo(() => statusCounts(animals), [animals]);
  const reviewSelected = filter === "review";
  // The chip that is currently on stays on screen at zero, the same way a
  // status chip does, so the filter can be switched back off.
  const showReview =
    reviewCount !== undefined && (reviewCount > 0 || reviewSelected);

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
          selected={filter === null}
          onClick={() => onFilterChange(null)}
        />
        {showReview && (
          <Chip
            icon={ClipboardList}
            label={portalText.reviewChip}
            count={reviewCount}
            selected={reviewSelected}
            onClick={() => onFilterChange(reviewSelected ? null : "review")}
          />
        )}
        {PORTAL_STATUSES.map((option) => {
          const selected = filter === option;
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
              onClick={() => onFilterChange(selected ? null : option)}
            />
          );
        })}
      </div>
    </div>
  );
}
