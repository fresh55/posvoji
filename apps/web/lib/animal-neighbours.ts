import { adoptableNow, type AnimalFields } from "@/lib/animal";

type Neighbour = Pick<AnimalFields, "id" | "species" | "status"> & {
  shelter: Pick<AnimalFields["shelter"], "id">;
};

/** How many animals the row on an animal's page draws: one row of four from
 *  sm up, two rows of two on a phone. */
export const NEIGHBOUR_LIMIT = 4;

/**
 * The animals an animal's page offers beside it: others at the same shelter
 * that can be adopted now, its own species first.
 *
 * The list is read from the animal's own place in the dataset onward and wraps
 * round, so two pages of one shelter do not all offer the same first four and
 * every animal of a large shelter is offered by some page.
 */
export function shelterNeighbours<T extends Neighbour>(
  animals: readonly T[],
  animal: Neighbour,
  limit: number = NEIGHBOUR_LIMIT,
): T[] {
  const place = animals.findIndex((other) => other.id === animal.id);
  const onward = [...animals.slice(place + 1), ...animals.slice(0, place + 1)];
  const others = onward.filter(
    (other) =>
      other.id !== animal.id &&
      other.shelter.id === animal.shelter.id &&
      adoptableNow(other.status),
  );
  return [
    ...others.filter((other) => other.species === animal.species),
    ...others.filter((other) => other.species !== animal.species),
  ].slice(0, limit);
}
