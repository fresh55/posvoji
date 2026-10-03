import { adoptableNow, type AnimalFields } from "@/lib/animal";

type Neighbour = Pick<AnimalFields, "id" | "species" | "status">;

/** One row of four from sm up, two rows of two on a phone. */
const NEIGHBOUR_LIMIT = 4;

/**
 * The animals an animal's page offers beside it: the others of its shelter
 * that can be adopted now, its own species first.
 *
 * Takes the shelter's own list (shelterAnimals in lib/dataset.ts), read from
 * the animal's place in it onward and wrapping round, so two pages of one
 * shelter do not all offer the same first four and every animal of a large
 * shelter is offered by some page.
 */
export function shelterNeighbours<T extends Neighbour>(
  shelter: readonly T[],
  animal: Neighbour,
): T[] {
  const place = shelter.findIndex((other) => other.id === animal.id);
  const onward = [...shelter.slice(place + 1), ...shelter.slice(0, place + 1)];
  const others = onward.filter(
    (other) => other.id !== animal.id && adoptableNow(other.status),
  );
  return [
    ...others.filter((other) => other.species === animal.species),
    ...others.filter((other) => other.species !== animal.species),
  ].slice(0, NEIGHBOUR_LIMIT);
}
