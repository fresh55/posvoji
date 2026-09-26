"use client";

import { useCallback, useDeferredValue, useEffect, useMemo } from "react";
import type { AnimalFields } from "@/lib/animal";
import {
  prefetchAnimalDescriptions,
  useSettledAnimalDescriptions,
} from "@/lib/animal-descriptions";
import { rankBySearch, searchAnimals } from "@/lib/filters/search";

/**
 * The dataset as a search leaves it, for everything after it to count and
 * draw: the species tabs, the facet counts, the chips' gains, the unanswered
 * notes, the empty state and the cards all describe what the query found.
 * With no query it is the dataset itself, the same array, so nothing
 * downstream sees a new list.
 *
 * `query` is the one the grid is drawing, which trails the address by a render
 * (shownFilters in animal-grid.tsx). The search is then worked out at the
 * priority of the cards it narrows, never in the frame a key lands in.
 */
export function useAnimalSearch<T extends AnimalFields>(
  dataset: T[],
  query: string,
) {
  const active = query !== "";
  // Read only while there is a query. The file also lands whenever the grid
  // is first hovered, and without a query that would be a render of the whole
  // grid for nothing.
  const settled = useSettledAnimalDescriptions(active);
  // The file landing changes the list the way a filter does, so it is drawn
  // at the same priority.
  const descriptions = useDeferredValue(settled);

  // The descriptions are the one field the grid does not carry. The field
  // asks for them on its first key; this covers a shared ?isci= link, which
  // has a query before anyone has typed.
  useEffect(() => {
    if (active) void prefetchAnimalDescriptions();
  }, [active]);

  const { found, tiers } = useMemo(
    () => searchAnimals(dataset, query, descriptions),
    [dataset, query, descriptions],
  );
  const rank = useCallback(
    (sorted: T[]) => rankBySearch(sorted, tiers),
    [tiers],
  );

  return {
    animals: found,
    /** Name matches first, then breed, then description, each in the order
     *  it is given. The identity when there is no query. */
    rank,
    /** A query the descriptions have not answered yet. What it finds so far
     *  is by name and breed alone. */
    pending: active && descriptions === undefined,
  };
}
