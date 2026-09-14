import type { ShelterJumpChip } from "@/components/shelter-jump-strip";
import { publishedCount } from "@/lib/shelter-census";

/** What the index needs of a card: where it is, which town, and how many
 *  animals the shelter shares. Structural rather than ShelterCardData, so a
 *  test can hand it three fields. */
type Indexed = { id: string; city: string; animals?: number };

/**
 * The phone strip's chips: one per town, in the order the grid draws them.
 *
 * One per town and not one per card. The strip is an index of the sort key,
 * and two of the register's towns hold two shelters each: drawn per card,
 * Celje stood in the row twice, "Celje 186" beside "Celje", and nothing on
 * either chip said which shelter it was. A reader looking for the Celje
 * shelter wants both, and the grid already puts them side by side, so one
 * chip lands on the first and the second is the next card down.
 *
 * The count is the town's, which is the sum of what its shelters share, on
 * the same rule as the card's pill (publishedCount): a town whose shelters
 * share nothing sends no count at all rather than a zero. The key is spread
 * in so a chip without one carries no marker saying it has none.
 *
 * Grouped by town rather than by adjacency, in first-seen order. The atlas
 * hands this the cards already sorted by town, so the two are the same
 * today; grouping by the field is what keeps them the same if the sort ever
 * changes under it.
 */
export function jumpChips(
  shelters: readonly Indexed[],
  label: (count: number) => string,
): ShelterJumpChip[] {
  const towns = new Map<string, { id: string; city: string; total: number }>();
  for (const shelter of shelters) {
    const town = towns.get(shelter.city);
    const count = publishedCount(shelter.animals) ?? 0;
    if (town) town.total += count;
    else towns.set(shelter.city, { id: shelter.id, city: shelter.city, total: count });
  }

  return [...towns.values()].map(({ id, city, total }) => ({
    id,
    city,
    ...(total > 0 && { count: { value: total, label: label(total) } }),
  }));
}
