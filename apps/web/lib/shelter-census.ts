/**
 * The shelters index's own totals, counted once for both things that print
 * them.
 *
 * Two surfaces read the same count and have to agree: the census line under
 * the lede, which states how many shelters share a list and how many animals
 * are waiting, and the green pill on each card, which states one shelter's
 * number. They agreed by construction while both came off a Map built inline
 * in the page component, and nothing said they had to.
 *
 * What makes them able to disagree is the join. The pills are drawn from the
 * register, and the animal counts come from the dataset, which is keyed by a
 * shelter id of its own: an animal whose shelter is not in data/shelters.yaml
 * has no card to be counted on, and the old inline Map counted it anyway. The
 * census would then have said twelve shelters share data over eleven pills,
 * and the animal total would have been larger than the pills add up to.
 *
 * So the join happens here, in one place, and what does not belong to a
 * registered shelter comes back named rather than folded into a total.
 */

/** What this needs of a shelter, which is its id. Structural rather than the
 *  registry type, so a test can count against a list of ids. */
type Registered = { id: string };

/** What this needs of an animal, which is the shelter it belongs to. */
type Counted = { shelter: { id: string } };

export type ShelterCensus = {
  /** Animals per registered shelter, for the shelters that hold any. A
   *  shelter sharing no list is absent rather than zero: the page never
   *  prints a zero, because a zero reads as a shelter with no animals rather
   *  than as a shelter we publish nothing for. */
  byShelter: ReadonlyMap<string, number>;
  /** How many shelters share a list at all, which is the census line's own
   *  number and the count of green pills the grid draws. */
  withData: number;
  /** How many animals those shelters hold, which is the sum of the pills. */
  animals: number;
  /** Shelter ids the dataset holds animals for that the register does not
   *  list, sorted. Not counted anywhere above: a shelter with no registry
   *  entry has no card, no detail page and no census share. Empty is the only
   *  state the site is built for, and the index refuses to render otherwise;
   *  it is returned rather than thrown so the caller decides, and so a test
   *  can see the case without catching. */
  unregistered: readonly string[];
};

export function shelterCensus(
  shelters: readonly Registered[],
  animals: readonly Counted[],
): ShelterCensus {
  const registered = new Set(shelters.map((shelter) => shelter.id));
  const byShelter = new Map<string, number>();
  const unregistered = new Set<string>();

  for (const animal of animals) {
    const id = animal.shelter.id;
    if (!registered.has(id)) {
      unregistered.add(id);
      continue;
    }
    byShelter.set(id, (byShelter.get(id) ?? 0) + 1);
  }

  let total = 0;
  for (const count of byShelter.values()) total += count;

  return {
    byShelter,
    withData: byShelter.size,
    animals: total,
    unregistered: [...unregistered].sort(),
  };
}
