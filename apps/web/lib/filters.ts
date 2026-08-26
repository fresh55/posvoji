import type {
  Animal,
  AnimalSize,
  EnergyLevel,
  Sex,
  Species,
} from "@posvoji/schema";
import type { Locale } from "@/lib/i18n";
import {
  LEGACY_TAB_SLUGS,
  SPECIES_TAB_ORDER,
  SPECIES_TAB_SLUGS,
  TAB_OF_SPECIES,
  type SpeciesTab,
} from "@/lib/species";

export type SpeciesFilter = "all" | SpeciesTab;
export type AgeGroup = "mladicek" | "odrasel" | "senior";
export type MultiGroup = "sex" | "age" | "size" | "energy" | "shelter";

// Yes/no properties an animal either has or doesn't. Choices within this
// section combine with OR, and sections combine with AND. Every section works
// this way except Družba, whose choices are constraints of one household
// rather than alternatives of one attribute.
export type ToggleKey =
  | "sterilizacija"
  | "cepljenje"
  | "cip"
  | "brez-fiv"
  | "brez-felv";

// Who the animal can live with. The schema answers each of these with
// yes/no/unknown; the filter only ever asks for "yes", because a maybe is not
// something to hand a family looking for a safe match.
export const GOOD_WITH_KEYS = ["kids", "dogs", "cats"] as const;
export type GoodWithKey = (typeof GOOD_WITH_KEYS)[number];

// What kind of home the animal fits. One value today; kept as a list like
// every other section so the URL codec and a second value later need no new
// shape. Only a recorded yes counts, the same principle as Družba: a maybe is
// never sold as a yes to someone who has only a flat to offer.
export const HOME_KEYS = ["apartment"] as const;
export type HomeKey = (typeof HOME_KEYS)[number];

// Not a warning but a way in: it exists for visitors who came looking for the
// animal that needs more from them, and who would otherwise never find it.
export const CARE_KEYS = ["patient"] as const;
export type CareKey = (typeof CARE_KEYS)[number];

export type Filters = {
  species: SpeciesFilter;
  sex: Sex[];
  age: AgeGroup[];
  size: AnimalSize[];
  energy: EnergyLevel[];
  shelter: string[];
  toggles: ToggleKey[];
  goodWith: GoodWithKey[];
  home: HomeKey[];
  care: CareKey[];
};

export const EMPTY_FILTERS: Filters = {
  species: "all",
  sex: [],
  age: [],
  size: [],
  energy: [],
  shelter: [],
  toggles: [],
  goodWith: [],
  home: [],
  care: [],
};

export const GROUPS: MultiGroup[] = ["sex", "age", "size", "energy", "shelter"];

/** Every question the filter asks, as one union. MultiGroup covers the five
 *  that share a codec; the four below each carry their own key type, so they
 *  are named here rather than folded in. The chips row is the one surface that
 *  has to talk about all nine at once: it groups by facet and it draws one
 *  icon per facet, and both need a single name for "which question is this". */
export type FilterFacet = MultiGroup | "toggles" | "goodWith" | "home" | "care";

export const FILTER_FACETS: FilterFacet[] = [
  ...GROUPS,
  "toggles",
  "goodWith",
  "home",
  "care",
];

const GROUP_LABELS: Record<Locale, Record<MultiGroup, string>> = {
  sl: {
    sex: "Spol",
    age: "Starost",
    size: "Velikost",
    energy: "Energija",
    shelter: "Zavetišče",
  },
  en: {
    sex: "Sex",
    age: "Age",
    size: "Size",
    energy: "Energy",
    shelter: "Shelter",
  },
};

export function groupLabel(group: MultiGroup, locale: Locale): string {
  return GROUP_LABELS[locale][group];
}

// species pins a toggle to one tab; without it the toggle asks something every
// species can answer.
export type ToggleDef = {
  key: ToggleKey;
  label: string;
  species?: Species;
  matches: (animal: Animal) => boolean;
};

// Nouns, not adjectives: Slovenian would force a gender on "cepljen" that
// "živali" doesn't share.
export const TOGGLES: ToggleDef[] = [
  {
    key: "sterilizacija",
    label: "Sterilizacija",
    matches: (animal) => animal.medical?.neutered === true,
  },
  {
    key: "cepljenje",
    label: "Cepljenje",
    matches: (animal) => animal.medical?.vaccinated === true,
  },
  {
    key: "cip",
    label: "Čip",
    matches: (animal) => animal.medical?.microchipped === true,
  },
  // Only a recorded negative counts. An untested cat is "unknown", and letting
  // that through would sell a maybe as an all-clear on the one question these
  // filters exist to answer.
  {
    key: "brez-fiv",
    label: "Brez FIV",
    species: "cat",
    matches: (animal) => animal.medical?.fiv === "negative",
  },
  {
    key: "brez-felv",
    label: "Brez FeLV",
    species: "cat",
    matches: (animal) => animal.medical?.felv === "negative",
  },
];

const TOGGLE_LABELS_EN: Record<ToggleKey, string> = {
  sterilizacija: "Neutered",
  cepljenje: "Vaccinated",
  cip: "Microchipped",
  "brez-fiv": "FIV negative",
  "brez-felv": "FeLV negative",
};

export function toggleLabel(key: ToggleKey, locale: Locale = "sl"): string {
  return locale === "sl"
    ? (TOGGLES.find((toggle) => toggle.key === key)?.label ?? key)
    : TOGGLE_LABELS_EN[key];
}

/** Only a recorded yes counts, so "unknown" and no both drop out. */
export function goodWithMatches(animal: Animal, key: GoodWithKey): boolean {
  return animal.goodWith?.[key] === "yes";
}

/** Only a recorded yes counts, so "unknown" and no both drop out. */
export function homeMatches(animal: Animal, key: HomeKey): boolean {
  switch (key) {
    case "apartment":
      return animal.apartmentOk === "yes";
  }
}

/** Only a shelter that said so counts; an unanswered animal is not one. */
export function careMatches(animal: Animal, key: CareKey): boolean {
  switch (key) {
    case "patient":
      return animal.specialNeeds === true;
  }
}

// Boundaries in months: under a year is a baby, past eight a senior.
const PUPPY_MAX_EXCLUSIVE = 12;
const ADULT_MAX_EXCLUSIVE = 96;

// A date-only ISO string parses as UTC midnight, so both sides of the
// subtraction have to be read in UTC. Reading one of them locally shifted the
// month by one west of Greenwich, which moved animals between age buckets.
// Takes the two fields rather than an Animal, so the portal, whose animals
// come from the API rather than the schema, reads the same arithmetic.
export function ageInMonths(
  animal: { birthDate?: string; approximateAgeMonths?: number },
  now: Date,
): number | undefined {
  // The approximate answer first, and only then the parse: passing bornAt() as
  // an argument made it eager, which put a Date construction back into the
  // youngest/oldest sort for every animal that carries both fields.
  if (animal.approximateAgeMonths !== undefined) return animal.approximateAgeMonths;
  return ageFrom(undefined, bornAt(animal.birthDate), monthsOf(now));
}

// Whole months, the unit the subtraction above is done in. Split out because
// the index below holds a birth date as one of these: a number that does not
// move is a column it can build once, where a date has to be parsed again
// every time somebody asks how old the animal is.
function monthsOf(date: Date): number {
  return date.getUTCFullYear() * 12 + date.getUTCMonth();
}

function bornAt(birthDate: string | undefined): number | undefined {
  if (!birthDate) return undefined;
  const birth = new Date(birthDate);
  return Number.isNaN(birth.getTime()) ? undefined : monthsOf(birth);
}

// The rule itself, with both callers going through it so the index and the
// dialog can never come to different answers about the same animal.
function ageFrom(
  approximate: number | undefined,
  born: number | undefined,
  nowMonths: number,
): number | undefined {
  if (approximate !== undefined) return approximate;
  if (born === undefined) return undefined;
  return Math.max(0, nowMonths - born);
}

// Exported so the dialog can show the same life stage the filter buckets by.
export function ageGroup(months: number): AgeGroup {
  if (months < PUPPY_MAX_EXCLUSIVE) return "mladicek";
  if (months < ADULT_MAX_EXCLUSIVE) return "odrasel";
  return "senior";
}

function matchesSpecies(animal: Animal, species: SpeciesFilter): boolean {
  return species === "all" || TAB_OF_SPECIES[animal.species] === species;
}

// ---------------------------------------------------------------------------
// The index.
//
// Every question the panel asks is a walk over the same animals: the result,
// five facet tallies, four section tallies, five "has this section anything
// left to narrow", and, since the chips row started pricing its pills, one
// more walk per active chip. Each of those re-read every animal's fields and
// re-parsed every birth date, so a screen with ten chips did the same date
// arithmetic eighty times over. That is fine at five hundred animals and it is
// the first thing that stops being fine.
//
// So the fields the filter cares about are read once into columns, and the
// four key sections are reduced to a bitmask each: "which of these does this
// animal answer" becomes one number, and "does it answer any of the ones I
// picked" becomes one &. Every walk below is then integer work over arrays.
// ---------------------------------------------------------------------------

/** One bit per key, in the order that section's key list declares them. */
function maskOf(count: number, answers: (bit: number) => boolean): number {
  let mask = 0;
  for (let bit = 0; bit < count; bit += 1) {
    if (answers(bit)) mask |= 1 << bit;
  }
  return mask;
}

/** The toggle keys in the order TOGGLES declares them, which is the bit order
 *  of every toggle mask in the index. Exported so nothing has to re-derive it
 *  and risk a different order. */
export const TOGGLE_KEYS: readonly ToggleKey[] = TOGGLES.map(
  (toggle) => toggle.key,
);

// One bit per group, in GROUPS order. Written out rather than derived, so a
// sixth group fails to compile here instead of quietly sharing a bit with one
// of these.
const GROUP_BITS: Record<MultiGroup, number> = {
  sex: 1 << 0,
  age: 1 << 1,
  size: 1 << 2,
  energy: 1 << 3,
  shelter: 1 << 4,
};

type Column<Value> = readonly (Value | undefined)[];

/** The dataset as the filter reads it: one slot per animal, in the order the
 *  animals were given. Every column here is a property of the animal alone,
 *  which is what lets one index answer for any date. Age is the exception, and
 *  it is held as its two date-free halves. */
type FilterIndex = {
  readonly species: readonly Species[];
  readonly sex: Column<string>;
  readonly size: Column<string>;
  readonly energy: Column<string>;
  readonly shelter: readonly string[];
  readonly approximate: Column<number>;
  readonly born: Column<number>;
  readonly toggles: readonly number[];
  readonly goodWith: readonly number[];
  readonly home: readonly number[];
  readonly care: readonly number[];
  /** The age buckets, worked out on demand and kept for as long as the same
   *  date keeps being asked about. The one column a clock moves. */
  ages: { at: number; values: Column<AgeGroup> } | null;
};

function buildIndex(animals: readonly Animal[]): FilterIndex {
  const species: Species[] = [];
  const sex: (string | undefined)[] = [];
  const size: (string | undefined)[] = [];
  const energy: (string | undefined)[] = [];
  const shelter: string[] = [];
  const approximate: (number | undefined)[] = [];
  const born: (number | undefined)[] = [];
  const toggles: number[] = [];
  const goodWith: number[] = [];
  const home: number[] = [];
  const care: number[] = [];
  for (const animal of animals) {
    species.push(animal.species);
    // "unknown" sex is semantically the same as absent: we do not know.
    sex.push(animal.sex === "unknown" ? undefined : animal.sex);
    size.push(animal.size);
    energy.push(animal.energy);
    shelter.push(animal.shelter.id);
    approximate.push(animal.approximateAgeMonths);
    born.push(bornAt(animal.birthDate));
    toggles.push(maskOf(TOGGLES.length, (bit) => TOGGLES[bit].matches(animal)));
    goodWith.push(
      maskOf(GOOD_WITH_KEYS.length, (bit) =>
        goodWithMatches(animal, GOOD_WITH_KEYS[bit]),
      ),
    );
    home.push(
      maskOf(HOME_KEYS.length, (bit) => homeMatches(animal, HOME_KEYS[bit])),
    );
    care.push(
      maskOf(CARE_KEYS.length, (bit) => careMatches(animal, CARE_KEYS[bit])),
    );
  }
  return {
    species,
    sex,
    size,
    energy,
    shelter,
    approximate,
    born,
    toggles,
    goodWith,
    home,
    care,
    ages: null,
  };
}

// One index per list, held weakly so a list the page has let go takes its
// index with it. Identity is the key, and that is what makes it safe: these
// lists come from an import or a memo and are never written to, and a list
// rebuilt from different animals is a different array with an index of its
// own. The page asks its eleven questions of the same two lists on every
// render, so in practice this builds twice per dataset and is read from
// thereafter.
const indexes = new WeakMap<readonly Animal[], FilterIndex>();

function indexOf(animals: readonly Animal[]): FilterIndex {
  const cached = indexes.get(animals);
  if (cached !== undefined) return cached;
  const index = buildIndex(animals);
  indexes.set(animals, index);
  return index;
}

function ageColumn(index: FilterIndex, nowMonths: number): Column<AgeGroup> {
  if (index.ages !== null && index.ages.at === nowMonths) {
    return index.ages.values;
  }
  const values = index.approximate.map((approximate, slot) => {
    const months = ageFrom(approximate, index.born[slot], nowMonths);
    return months === undefined ? undefined : ageGroup(months);
  });
  index.ages = { at: nowMonths, values };
  return values;
}

/** A selection resolved once per question rather than once per animal: the
 *  group choices as sets, the key sections as masks. */
type Query = {
  species: SpeciesFilter;
  groups: Record<MultiGroup, ReadonlySet<string> | null>;
  toggles: number;
  goodWith: number;
  home: number;
  care: number;
};

function queryOf(filters: Filters): Query {
  // null and not an empty set: the difference between a section asking nothing
  // and a section asking for something no animal has.
  const chosen = (group: MultiGroup): ReadonlySet<string> | null =>
    filters[group].length === 0 ? null : new Set<string>(filters[group]);
  return {
    species: filters.species,
    groups: {
      sex: chosen("sex"),
      age: chosen("age"),
      size: chosen("size"),
      energy: chosen("energy"),
      shelter: chosen("shelter"),
    },
    toggles: maskOf(TOGGLES.length, (bit) =>
      filters.toggles.includes(TOGGLE_KEYS[bit]),
    ),
    goodWith: maskOf(GOOD_WITH_KEYS.length, (bit) =>
      filters.goodWith.includes(GOOD_WITH_KEYS[bit]),
    ),
    home: maskOf(HOME_KEYS.length, (bit) =>
      filters.home.includes(HOME_KEYS[bit]),
    ),
    care: maskOf(CARE_KEYS.length, (bit) =>
      filters.care.includes(CARE_KEYS[bit]),
    ),
  };
}

/** Everything a walk over the animals needs, worked out before it starts. */
type Pass = {
  index: FilterIndex;
  ages: Column<AgeGroup>;
  query: Query;
};

function passOf(animals: Animal[], filters: Filters, now: Date): Pass {
  const index = indexOf(animals);
  return {
    index,
    ages: ageColumn(index, monthsOf(now)),
    query: queryOf(filters),
  };
}

/** How many animals the pass walks. The index's own columns say, so a Pass
 *  cannot hold an extent that disagrees with the columns it reads. */
function lengthOf(pass: Pass): number {
  return pass.index.species.length;
}

function valueAt(
  pass: Pass,
  slot: number,
  group: MultiGroup,
): string | undefined {
  switch (group) {
    case "sex":
      return pass.index.sex[slot];
    case "age":
      return pass.ages[slot];
    case "size":
      return pass.index.size[slot];
    case "energy":
      return pass.index.energy[slot];
    case "shelter":
      return pass.index.shelter[slot];
  }
}

function speciesAt(pass: Pass, slot: number): boolean {
  return (
    pass.query.species === "all" ||
    TAB_OF_SPECIES[pass.index.species[slot]] === pass.query.species
  );
}

/** Which group sections this animal fails, one bit each. An animal without the
 *  field only drops out once the group is actively filtered: selecting
 *  "samica" is a requirement, not a preference. */
function groupsFailedAt(pass: Pass, slot: number): number {
  let failed = 0;
  for (const group of GROUPS) {
    const chosen = pass.query.groups[group];
    if (chosen === null) continue;
    const value = valueAt(pass, slot, group);
    if (value === undefined || !chosen.has(value)) failed |= GROUP_BITS[group];
  }
  return failed;
}

/** OR within the section: any one of the picked keys is enough, and a section
 *  with nothing picked asks nothing. Lastnosti, Dom and Skrb all read this
 *  way. */
function answersAny(answered: number, picked: number): boolean {
  return picked === 0 || (answered & picked) !== 0;
}

// AND within this section, unlike every other one. The other sections offer
// alternatives of a single attribute, so widening them is what the visitor
// asked for. These are independent constraints of one household: a family with
// a child and a dog needs both answered yes, and an OR here would put
// dog-intolerant animals in front of dog owners. What comes back is which
// picked facets went unanswered rather than merely whether any did, because
// the counters below have to tell one missing answer from two.
function goodWithFailedAt(pass: Pass, slot: number): number {
  return pass.query.goodWith & ~pass.index.goodWith[slot];
}

/** The sections that are not groups, all of them except the one being
 *  measured. Every counter below wants this and each wants a different line
 *  left out, which is the faceting rule: a number next to an option is what
 *  you get when you pick it, so everything applies except the axis being
 *  counted.
 *
 *  Druzba is not among the axes that can be lifted here, and that is the AND
 *  exception showing through: the OR sections drop whole, so measuring one
 *  means switching it off, while an AND section has to keep the facets it is
 *  not measuring. goodWithCounts therefore passes null and does its own
 *  lifting. The groups are the caller's business too: facetCounts wants the
 *  mask of which ones failed, everyone else only wants it to be zero.
 *
 *  Vrsta is liftable too, because the species tabs are counters and the rule
 *  does not stop at the sidebar. It is named apart from LiftedSection rather
 *  than added to it: that type is also the key an OR counter indexes
 *  pass.index and pass.query with (orSectionCounts below), and those two hold
 *  bitmasks per slot while index.species holds a Species. Widened, `answered`
 *  came out as `number | Species` and the mask arithmetic stopped compiling.
 *  Only speciesFacetCounts lifts vrsta; every other caller is measuring
 *  something within a species tab and wants the tab to hold. */
type LiftedSection = "toggles" | "home" | "care";

function sectionsPass(
  pass: Pass,
  slot: number,
  lift: LiftedSection | "species" | null,
): boolean {
  if (lift !== "species" && !speciesAt(pass, slot)) return false;
  if (
    lift !== "toggles" &&
    !answersAny(pass.index.toggles[slot], pass.query.toggles)
  ) {
    return false;
  }
  // Cheapest guard of the four and the one that rejects most, so it goes
  // early rather than behind the two that walk a key list.
  if (goodWithFailedAt(pass, slot) !== 0) return false;
  if (lift !== "home" && !answersAny(pass.index.home[slot], pass.query.home)) {
    return false;
  }
  if (lift !== "care" && !answersAny(pass.index.care[slot], pass.query.care)) {
    return false;
  }
  return true;
}

function bump(counts: Map<string, number>, key: string): void {
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

/** How one answer is named where a facet and a value have to travel together:
 *  the key chipGains prices under, and the key the chips row is built with.
 *  Exported because both sides need the same spelling and neither should be
 *  free to invent it. */
export function chipKey(facet: FilterFacet, value: string): string {
  return `${facet}:${value}`;
}

export function applyFilters(
  animals: Animal[],
  filters: Filters,
  now: Date,
): Animal[] {
  const pass = passOf(animals, filters, now);
  return animals.filter(
    (_, slot) =>
      speciesAt(pass, slot) &&
      answersAny(pass.index.toggles[slot], pass.query.toggles) &&
      goodWithFailedAt(pass, slot) === 0 &&
      answersAny(pass.index.home[slot], pass.query.home) &&
      answersAny(pass.index.care[slot], pass.query.care) &&
      groupsFailedAt(pass, slot) === 0,
  );
}

// The faceting rule, shared by every counter here: a number next to an option
// is what you get when you pick it, so every filter applies except the one
// axis being counted. Groups skip themselves; the key sections drop themselves
// from the selection.
//
// One walk and not one per group. An animal belongs in a group's tally exactly
// when the only group it fails, if any, is that group itself: fail nothing and
// it counts under every group, fail one and it counts under that one alone,
// fail two and no single pick can bring it back. That is the answer the five
// separate walks gave, read off one pass.
export function facetCounts(
  animals: Animal[],
  filters: Filters,
  now: Date,
): Record<MultiGroup, Map<string, number>> {
  const pass = passOf(animals, filters, now);
  const counts = {
    sex: new Map<string, number>(),
    age: new Map<string, number>(),
    size: new Map<string, number>(),
    energy: new Map<string, number>(),
    shelter: new Map<string, number>(),
  };
  for (let slot = 0; slot < lengthOf(pass); slot += 1) {
    if (!sectionsPass(pass, slot, null)) continue;
    const failed = groupsFailedAt(pass, slot);
    for (const group of GROUPS) {
      if ((failed & ~GROUP_BITS[group]) !== 0) continue;
      const value = valueAt(pass, slot, group);
      if (value === undefined) continue;
      bump(counts[group], value);
    }
  }
  return counts;
}

// Count each choice with the health axis removed, just like facetCounts
// removes the group it is measuring. The number then answers what this choice
// itself can add under the filters from every other section.
export function toggleCounts(
  animals: Animal[],
  filters: Filters,
  now: Date,
): Map<string, number> {
  const pass = passOf(animals, filters, now);
  const counts = new Map<string, number>(TOGGLE_KEYS.map((key) => [key, 0]));
  for (let slot = 0; slot < lengthOf(pass); slot += 1) {
    if (!sectionsPass(pass, slot, "toggles")) continue;
    if (groupsFailedAt(pass, slot) !== 0) continue;
    const answered = pass.index.toggles[slot];
    for (let bit = 0; bit < TOGGLE_KEYS.length; bit += 1) {
      if ((answered & (1 << bit)) !== 0) bump(counts, TOGGLE_KEYS[bit]);
    }
  }
  return counts;
}

// The number beside a choice still answers "what do I get if I pick this",
// but an AND section cannot drop its whole axis to work that out. Only the
// facet being measured comes off the selection; the rest stay on, and the
// facet itself is then required on top of them. Written out, that is: the
// animals that answer this facet and leave no other picked one unanswered,
// since an animal answering this facet cannot be failing on it.
export function goodWithCounts(
  animals: Animal[],
  filters: Filters,
  now: Date,
): Map<string, number> {
  const pass = passOf(animals, filters, now);
  const counts = new Map<string, number>(GOOD_WITH_KEYS.map((key) => [key, 0]));
  for (let slot = 0; slot < lengthOf(pass); slot += 1) {
    if (!sectionsPass(pass, slot, null)) continue;
    if (groupsFailedAt(pass, slot) !== 0) continue;
    const answered = pass.index.goodWith[slot];
    for (let bit = 0; bit < GOOD_WITH_KEYS.length; bit += 1) {
      if ((answered & (1 << bit)) !== 0) bump(counts, GOOD_WITH_KEYS[bit]);
    }
  }
  return counts;
}

// Same rule again, one section over, and this one ORs: the facet being
// measured comes off its own selection, whatever is left of that selection
// still applies, every other section stays on, and the facet is required on
// top of them.
//
// Dom and Skrb ask the same question of different columns, so they ask it
// through one walk rather than two copies of it. The line that does the real
// work is the second answersAny: it is the "whatever is left of that
// selection" clause, and it was the part worth not having twice.
function orSectionCounts(
  pass: Pass,
  section: LiftedSection,
  keys: readonly string[],
): Map<string, number> {
  const counts = new Map<string, number>(keys.map((key) => [key, 0]));
  const picked = pass.query[section];
  for (let slot = 0; slot < lengthOf(pass); slot += 1) {
    if (!sectionsPass(pass, slot, section)) continue;
    if (groupsFailedAt(pass, slot) !== 0) continue;
    const answered = pass.index[section][slot];
    for (let bit = 0; bit < keys.length; bit += 1) {
      const own = 1 << bit;
      if ((answered & own) === 0) continue;
      if (!answersAny(answered, picked & ~own)) continue;
      bump(counts, keys[bit]);
    }
  }
  return counts;
}

export function homeCounts(
  animals: Animal[],
  filters: Filters,
  now: Date,
): Map<string, number> {
  return orSectionCounts(passOf(animals, filters, now), "home", HOME_KEYS);
}

export function careCounts(
  animals: Animal[],
  filters: Filters,
  now: Date,
): Map<string, number> {
  return orSectionCounts(passOf(animals, filters, now), "care", CARE_KEYS);
}

/** What each active value is costing: how many more animals show if it comes
 *  off, everything else left alone. Keyed the way the chips row keys itself.
 *
 *  The number is signed, and negative is a real answer. Values inside one
 *  facet are OR-ed, so dropping one of two sexes leaves a narrower filter, not
 *  a wider one, and the row correctly offers nothing there.
 *
 *  One walk, where the row used to buy a full pass over the dataset per chip.
 *  What makes that possible is that dropping one value moves the result in
 *  exactly one of two ways, and both can be counted while walking:
 *
 *  - It empties its section, and the section stops asking. What comes back is
 *    everything that failed nothing but that section, which is the population
 *    the section's own facet counts are already measured over.
 *  - It leaves the section with alternatives. Nothing new can come in, and
 *    what goes out is the animals in the result this value alone was letting
 *    through.
 *
 *  Druzba is the exception to both, because it ANDs: dropping a facet there
 *  only ever widens, by exactly the animals that fail that facet and nothing
 *  else. */
export function chipGains(
  animals: Animal[],
  filters: Filters,
  now: Date,
): Map<string, number> {
  const gains = new Map<string, number>();
  if (activeFilterCount(filters) === 0) return gains;
  const pass = passOf(animals, filters, now);
  const { index, query } = pass;

  let result = 0;
  // Per section: the population left if that section stopped asking.
  const freedGroup: Record<MultiGroup, number> = {
    sex: 0,
    age: 0,
    size: 0,
    energy: 0,
    shelter: 0,
  };
  let freedToggles = 0;
  let freedHome = 0;
  let freedCare = 0;
  // Druzba's facets are counted one by one, since dropping one of them widens
  // by itself rather than by emptying the section.
  const freedGoodWith = new Map<string, number>();
  // Inside the result, what each picked value is holding up on its own.
  const sole = new Map<string, number>();

  for (let slot = 0; slot < lengthOf(pass); slot += 1) {
    if (!speciesAt(pass, slot)) continue;
    const groupsFailed = groupsFailedAt(pass, slot);
    const goodWithFailed = goodWithFailedAt(pass, slot);
    const togglesOk = answersAny(index.toggles[slot], query.toggles);
    const homeOk = answersAny(index.home[slot], query.home);
    const careOk = answersAny(index.care[slot], query.care);
    const orSectionsOk = togglesOk && homeOk && careOk;

    if (orSectionsOk && groupsFailed === 0) {
      for (let bit = 0; bit < GOOD_WITH_KEYS.length; bit += 1) {
        if (goodWithFailed === 1 << bit) {
          bump(freedGoodWith, GOOD_WITH_KEYS[bit]);
        }
      }
    }
    if (goodWithFailed !== 0) continue;

    if (orSectionsOk) {
      for (const group of GROUPS) {
        if ((groupsFailed & ~GROUP_BITS[group]) === 0) freedGroup[group] += 1;
      }
    }
    if (groupsFailed !== 0) continue;

    // Each of the three measured with itself lifted, which for an OR section
    // means the whole section.
    if (homeOk && careOk) freedToggles += 1;
    if (togglesOk && careOk) freedHome += 1;
    if (togglesOk && homeOk) freedCare += 1;
    if (!orSectionsOk) continue;

    // Everything passes, so this animal is in the result, and the result is
    // the only place a value can be the sole reason something is showing.
    result += 1;
    for (const group of GROUPS) {
      if (query.groups[group] === null) continue;
      const value = valueAt(pass, slot, group);
      if (value !== undefined) bump(sole, chipKey(group, value));
    }
    // An exact match on one bit is the test: this animal answers that value
    // and no other the section picked, so the value is holding it up alone.
    for (let bit = 0; bit < TOGGLE_KEYS.length; bit += 1) {
      if ((index.toggles[slot] & query.toggles) === 1 << bit) {
        bump(sole, chipKey("toggles", TOGGLE_KEYS[bit]));
      }
    }
    for (let bit = 0; bit < HOME_KEYS.length; bit += 1) {
      if ((index.home[slot] & query.home) === 1 << bit) {
        bump(sole, chipKey("home", HOME_KEYS[bit]));
      }
    }
    for (let bit = 0; bit < CARE_KEYS.length; bit += 1) {
      if ((index.care[slot] & query.care) === 1 << bit) {
        bump(sole, chipKey("care", CARE_KEYS[bit]));
      }
    }
  }

  // A section with one value picked empties when that value comes off; a
  // section with more keeps asking, so what leaves is what only that value
  // was answering for.
  const price = (key: string, last: boolean, freed: number) => {
    gains.set(key, last ? freed - result : -(sole.get(key) ?? 0));
  };
  for (const group of GROUPS) {
    const chosen = filters[group];
    for (const value of chosen) {
      price(chipKey(group, value), chosen.length === 1, freedGroup[group]);
    }
  }
  for (const key of filters.toggles) {
    price(chipKey("toggles", key), filters.toggles.length === 1, freedToggles);
  }
  for (const key of filters.home) {
    price(chipKey("home", key), filters.home.length === 1, freedHome);
  }
  for (const key of filters.care) {
    price(chipKey("care", key), filters.care.length === 1, freedCare);
  }
  for (const key of filters.goodWith) {
    gains.set(chipKey("goodWith", key), freedGoodWith.get(key) ?? 0);
  }
  return gains;
}

// The panel measures itself against the species tab rather than the whole
// dataset, so what it offers is what the animals on screen can be narrowed by.
export function bySpecies(animals: Animal[], species: SpeciesFilter): Animal[] {
  // The same array back on the Vse tab, and deliberately: a copy is a second
  // identity, and a second identity is a second index over the very same
  // animals (see indexOf). Every caller treats the pool as read-only, and the
  // landing state is the one where the copy bought nothing at all.
  if (species === "all") return animals;
  return animals.filter((animal) => matchesSpecies(animal, species));
}

// Velikost sorts dogs, but for cats it is a distinction nobody shops on.
function groupFitsSpecies(group: MultiGroup, species: SpeciesFilter): boolean {
  return !(group === "size" && species === "cat");
}

// A pinned toggle stays off the "Vse" tab too: there it would quietly discard
// every dog in the list.
function toggleFitsSpecies(
  only: Species | undefined,
  species: SpeciesFilter,
): boolean {
  return only === undefined || TAB_OF_SPECIES[only] === species;
}

/** How many animals answer each key of one section, in a single walk. All four
 *  callers below want the same thing from it: a key every animal answers, or
 *  none do, cannot narrow anything. */
function answeredCounts(masks: readonly number[], keys: number): number[] {
  const counts = new Array<number>(keys).fill(0);
  for (const mask of masks) {
    for (let bit = 0; bit < keys; bit += 1) {
      if ((mask & (1 << bit)) !== 0) counts[bit] += 1;
    }
  }
  return counts;
}

function narrows(matching: number, total: number): boolean {
  return matching > 0 && matching < total;
}

// Every visible* function below takes the current selection, and takes it
// required, and a value that is selected keeps its control on screen whatever
// the pool says. The rule these functions otherwise follow is "an option that
// cannot narrow anything is not worth a row", and that rule is right for an
// option nobody has picked and wrong for one somebody has: a selection is
// already narrowing the result, so hiding its control leaves a filter running
// with no way to switch it off. On a phone it is worse than that, because the
// Filtri trigger only exists while the sheet has sections (animal-filters.tsx),
// so the last section going takes the whole way in with it. Required and not
// defaulted, because a caller that forgets the argument gets exactly the
// stranding this guards against, and silently.

// A toggle that every animal passes (or none do) can't narrow anything.
export function visibleToggles(
  animals: Animal[],
  species: SpeciesFilter,
  selected: readonly ToggleKey[],
): ToggleDef[] {
  const counts = answeredCounts(indexOf(animals).toggles, TOGGLES.length);
  return TOGGLES.filter(
    (toggle, bit) =>
      selected.includes(toggle.key) ||
      (toggleFitsSpecies(toggle.species, species) &&
        narrows(counts[bit], animals.length)),
  );
}

/** Družba, Dom and Skrb ask one question of three different columns: which of
 *  this section's keys can still narrow the pool, plus whatever the visitor
 *  has already picked. One walk written once, the way narrows() above is the
 *  one place the narrowing rule itself is written. No species pinning in any
 *  of the three: every one of these questions is asked of dogs and cats alike,
 *  and a flat is a flat whether a dog or a cat lives in it. */
function visibleFacet<Key extends string>(
  keys: readonly Key[],
  column: "goodWith" | "home" | "care",
  animals: Animal[],
  selected: readonly Key[],
): Key[] {
  const counts = answeredCounts(indexOf(animals)[column], keys.length);
  return keys.filter(
    (key, bit) => selected.includes(key) || narrows(counts[bit], animals.length),
  );
}

export function visibleGoodWith(
  animals: Animal[],
  selected: readonly GoodWithKey[],
): GoodWithKey[] {
  return visibleFacet(GOOD_WITH_KEYS, "goodWith", animals, selected);
}

export function visibleHome(
  animals: Animal[],
  selected: readonly HomeKey[],
): HomeKey[] {
  return visibleFacet(HOME_KEYS, "home", animals, selected);
}

export function visibleCare(
  animals: Animal[],
  selected: readonly CareKey[],
): CareKey[] {
  return visibleFacet(CARE_KEYS, "care", animals, selected);
}

/** The number each species tab shows: everything the visitor asked for
 *  applies except the species axis itself, because that is the axis the tab
 *  would set. The same rule facetCounts follows, and for the same reason a
 *  number next to an option has to be what you get when you press it.
 *
 *  The toolbar used to show speciesCounts here, which walks the raw dataset.
 *  With four filters on, the tabs read 127 / 375 / 1 directly above a result
 *  count of 22: three numbers about one population on two different bases,
 *  and pressing "Psi 127" did not give you 127. This is the one counter on
 *  the page that was outside the rule.
 *
 *  `all` is the same total the result count carries, and the Vse tab still
 *  does not draw it (species-tabs.tsx). It is summed anyway because the
 *  record's shape is what every caller types against, and a member that lies
 *  is worse than one nobody reads. */
export function speciesFacetCounts(
  animals: Animal[],
  filters: Filters,
  now: Date,
): Record<SpeciesFilter, number> {
  const pass = passOf(animals, filters, now);
  const counts: Record<SpeciesFilter, number> = {
    all: 0,
    dog: 0,
    cat: 0,
    other: 0,
  };
  for (let slot = 0; slot < lengthOf(pass); slot += 1) {
    if (!sectionsPass(pass, slot, "species")) continue;
    if (groupsFailedAt(pass, slot) !== 0) continue;
    counts.all += 1;
    counts[TAB_OF_SPECIES[pass.index.species[slot]]] += 1;
  }
  return counts;
}

/** Every species the dataset holds, filters ignored. This is a roster and not
 *  a facet: it decides which tabs exist, the way the location picker's roster
 *  decides which shelters exist (animal-grid.tsx). A filter may move a tab's
 *  number, but it may not take the tab off the strip, or narrowing to "samica"
 *  would delete the way back to the other species. */
export function speciesCounts(animals: Animal[]): Record<SpeciesFilter, number> {
  const counts: Record<SpeciesFilter, number> = {
    all: animals.length,
    dog: 0,
    cat: 0,
    other: 0,
  };
  for (const animal of animals) {
    counts[TAB_OF_SPECIES[animal.species]] += 1;
  }
  return counts;
}

// A group with fewer than two distinct values can't narrow anything, unless the
// visitor has already answered it. ?vrsta=ostalo&spol=samec is the case that
// made this necessary: the one rabbit in the dataset is male, so Spol has a
// single distinct value and used to go, taking the sheet's last section and
// with it the Filtri trigger, while spol=samec went on filtering from the URL.
// pruneHiddenFilters cannot cover this one, because the selection is not wrong
// for the species tab, only invisible.
//
// The whole filter object and not a species beside it: the species tab and the
// selection are two questions of the same state, and taking them separately
// left every caller passing filters.species and filters to the same call.
export function visibleGroups(
  animals: Animal[],
  filters: Filters,
  now: Date,
): Record<MultiGroup, boolean> {
  const index = indexOf(animals);
  const ages = ageColumn(index, monthsOf(now));
  const distinct = {
    sex: new Set<string>(),
    age: new Set<string>(),
    size: new Set<string>(),
    energy: new Set<string>(),
    shelter: new Set<string>(),
  };
  const add = (group: MultiGroup, value: string | undefined) => {
    if (value !== undefined) distinct[group].add(value);
  };
  for (let slot = 0; slot < animals.length; slot += 1) {
    add("sex", index.sex[slot]);
    add("age", ages[slot]);
    add("size", index.size[slot]);
    add("energy", index.energy[slot]);
    add("shelter", index.shelter[slot]);
  }
  const shown = (group: MultiGroup) =>
    filters[group].length > 0 ||
    (groupFitsSpecies(group, filters.species) && distinct[group].size >= 2);
  return {
    sex: shown("sex"),
    age: shown("age"),
    size: shown("size"),
    energy: shown("energy"),
    shelter: shown("shelter"),
  };
}

// A selection the species tab no longer has a control for would go on narrowing
// results with no way to switch it off, so changing species drops it from state
// and from the URL rather than let it work unseen.
export function pruneHiddenFilters(filters: Filters): Filters {
  const keep = (group: MultiGroup) => groupFitsSpecies(group, filters.species);
  return {
    species: filters.species,
    sex: keep("sex") ? filters.sex : [],
    age: keep("age") ? filters.age : [],
    size: keep("size") ? filters.size : [],
    energy: keep("energy") ? filters.energy : [],
    shelter: keep("shelter") ? filters.shelter : [],
    toggles: filters.toggles.filter((key) =>
      toggleFitsSpecies(
        TOGGLES.find((t) => t.key === key)?.species,
        filters.species,
      ),
    ),
    // No facet here is pinned to a species, so nothing to prune: a selection
    // made on one tab still has a control on the next. The same holds for the
    // two sections below.
    goodWith: filters.goodWith,
    home: filters.home,
    care: filters.care,
  };
}

// city is the shelter's town, kept as its own field rather than a generic
// sublabel because the map places a marker from it.
export type FilterOption = { value: string; label: string; city?: string };

type CodedGroup = Exclude<MultiGroup, "shelter">;
// goodWith, home and care are not MultiGroups, but their values are coded the
// same way and want the same one place to name them.
type ValueGroup = "goodWith" | "home" | "care";
type MetadataGroup = CodedGroup | ValueGroup;
type CodedValueByGroup = {
  sex: Exclude<Sex, "unknown">;
  age: AgeGroup;
  size: AnimalSize;
  energy: EnergyLevel;
  goodWith: GoodWithKey;
  home: HomeKey;
  care: CareKey;
};

/** The canonical metadata for coded filter values. */
export type FilterValueDefinition<Value extends string = string> = {
  readonly value: Value;
  readonly slug: string;
  readonly labels: Readonly<Record<Locale, string>>;
};

export const FILTER_METADATA = {
  sex: [
    { value: "male", slug: "samec", labels: { sl: "Samec", en: "Male" } },
    {
      value: "female",
      slug: "samica",
      labels: { sl: "Samica", en: "Female" },
    },
  ],
  age: [
    {
      value: "mladicek",
      slug: "mladicek",
      labels: { sl: "Mladiček", en: "Young" },
    },
    {
      value: "odrasel",
      slug: "odrasel",
      labels: { sl: "Odrasel", en: "Adult" },
    },
    {
      value: "senior",
      slug: "senior",
      labels: { sl: "Senior", en: "Senior" },
    },
  ],
  size: [
    { value: "small", slug: "majhna", labels: { sl: "Majhna", en: "Small" } },
    {
      value: "medium",
      slug: "srednja",
      labels: { sl: "Srednja", en: "Medium" },
    },
    { value: "large", slug: "velika", labels: { sl: "Velika", en: "Large" } },
  ],
  energy: [
    { value: "calm", slug: "miren", labels: { sl: "Miren", en: "Calm" } },
    {
      value: "balanced",
      slug: "uravnotezen",
      labels: { sl: "Uravnotežen", en: "Balanced" },
    },
    {
      value: "lively",
      slug: "zivahen",
      labels: { sl: "Živahen", en: "Lively" },
    },
  ],
  // The labels answer the section's question ("Doma imam: Psa"), so they do not
  // collide with the species tabs, which say "Psi" for a list of dogs. The
  // slugs stay as they were: shared links have to keep working.
  goodWith: [
    { value: "kids", slug: "otroci", labels: { sl: "Otroke", en: "Kids" } },
    { value: "dogs", slug: "psi", labels: { sl: "Psa", en: "A dog" } },
    { value: "cats", slug: "macke", labels: { sl: "Mačko", en: "A cat" } },
  ],
  home: [
    {
      value: "apartment",
      slug: "stanovanje",
      labels: { sl: "Primeren za stanovanje", en: "Apartment-friendly" },
    },
  ],
  care: [
    {
      value: "patient",
      slug: "potrpezljiv",
      labels: {
        sl: "Potrebuje potrpežljivega človeka",
        en: "Needs a patient person",
      },
    },
  ],
} as const satisfies {
  [Group in MetadataGroup]: readonly FilterValueDefinition<
    CodedValueByGroup[Group]
  >[];
};

/** The section's own options, in the order the cards show them. */
export function goodWithOptions(
  locale: Locale = "sl",
): { key: GoodWithKey; label: string }[] {
  return FILTER_METADATA.goodWith.map(({ value, labels }) => ({
    key: value,
    label: labels[locale],
  }));
}

export function homeOptions(
  locale: Locale = "sl",
): { key: HomeKey; label: string }[] {
  return FILTER_METADATA.home.map(({ value, labels }) => ({
    key: value,
    label: labels[locale],
  }));
}

export function careOptions(
  locale: Locale = "sl",
): { key: CareKey; label: string }[] {
  return FILTER_METADATA.care.map(({ value, labels }) => ({
    key: value,
    label: labels[locale],
  }));
}

// Exhaustive like groupValue: a new group names its own options rather than
// inheriting whichever branch happens to be last.
export function groupOptions(
  group: MultiGroup,
  animals: Animal[],
  locale: Locale = "sl",
): FilterOption[] {
  switch (group) {
    case "shelter": {
      const shelters = new Map<string, { name: string; city: string }>();
      for (const animal of animals) {
        shelters.set(animal.shelter.id, {
          name: animal.shelter.name,
          city: animal.shelter.city,
        });
      }
      return [...shelters]
        .map(([value, { name, city }]) => ({ value, label: name, city }))
        .sort((a, b) => a.label.localeCompare(b.label, "sl"));
    }
    case "sex":
    case "age":
    case "size":
    case "energy":
      return FILTER_METADATA[group].map(({ value, labels }) => ({
        value,
        label: labels[locale],
      }));
  }
}

export function optionLabel(
  group: MultiGroup,
  value: string,
  animals: Animal[],
  locale: Locale = "sl",
): string {
  const option = groupOptions(group, animals, locale).find(
    (candidate) => candidate.value === value,
  );
  return option?.label ?? value;
}

// URL codecs. Slovenian, ASCII-only params: ?vrsta=pes&spol=samica&starost=mladicek
// The tab slugs live in lib/species.ts, which imports nothing but a type, so
// the tabs and the portal can read them without pulling this module and its
// dependencies along.
const PARAM_NAMES: Record<MultiGroup, string> = {
  sex: "spol",
  age: "starost",
  size: "velikost",
  energy: "energija",
  shelter: "zavetisce",
};

// The value sections are not MultiGroups, so they carry their own param names
// and their own pair of lookups rather than three copies of the same find().
const VALUE_PARAM_NAMES: Record<ValueGroup, string> = {
  goodWith: "druzba",
  home: "dom",
  care: "skrb",
};

function valueSlug(group: ValueGroup, value: string): string {
  const options: readonly FilterValueDefinition[] = FILTER_METADATA[group];
  return options.find((option) => option.value === value)?.slug ?? value;
}

function valueFromSlug(group: ValueGroup, slug: string): string | undefined {
  const options: readonly FilterValueDefinition[] = FILTER_METADATA[group];
  return options.find((option) => option.slug === slug)?.value;
}

function toSlug(group: MultiGroup, value: string): string {
  if (group === "shelter") return value;
  return (
    FILTER_METADATA[group].find((option) => option.value === value)?.slug ??
    value
  );
}

function fromSlug(group: MultiGroup, slug: string): string | undefined {
  if (group === "shelter") return slug;
  return FILTER_METADATA[group].find((option) => option.slug === slug)?.value;
}

// Every param name this codec owns. A write that rebuilds the query (see
// mergeOwnedParams in lib/location-search.ts) needs this list to know which
// params it is allowed to erase and replace; anything else in the URL is not
// its business and has to survive untouched.
export const FILTER_PARAM_NAMES: readonly string[] = [
  "vrsta",
  ...Object.values(PARAM_NAMES),
  "lastnosti",
  ...Object.values(VALUE_PARAM_NAMES),
];

export function serializeFilters(filters: Filters): string {
  const params = new URLSearchParams();
  if (filters.species !== "all") {
    params.set("vrsta", SPECIES_TAB_SLUGS[filters.species]);
  }
  for (const group of GROUPS) {
    if (filters[group].length > 0) {
      params.set(
        PARAM_NAMES[group],
        filters[group].map((v) => toSlug(group, v)).join(","),
      );
    }
  }
  if (filters.toggles.length > 0) {
    params.set("lastnosti", filters.toggles.join(","));
  }
  const setValues = (group: ValueGroup, selected: readonly string[]) => {
    if (selected.length === 0) return;
    params.set(
      VALUE_PARAM_NAMES[group],
      selected.map((value) => valueSlug(group, value)).join(","),
    );
  };
  setValues("goodWith", filters.goodWith);
  setValues("home", filters.home);
  setValues("care", filters.care);
  // Commas are legal unencoded, and these links get shared by hand.
  return params.toString().replace(/%2C/g, ",");
}

// Unknown slugs are dropped silently: a stale shared link should degrade to
// fewer filters, not break the page. So is anything the link's own species tab
// hides, such as a cat-only toggle carried onto ?vrsta=pes.
// What one param is allowed to put into state. Four of the five groups are
// bounded by their own metadata, but Zavetisce is not: its slugs are shelter
// ids, which the codec passes through because it has no dataset to check them
// against. Everything downstream then pays per value: a chip in the sticky
// header, and a full pass over the dataset to price that chip (chipGain in
// animal-grid.tsx). ?zavetisce= with five thousand ids in it was five thousand
// of each, on the phone, from a link anyone can write. The cap is well past
// the longest real selection, which is every shelter in the country at eleven.
const MAX_VALUES_PER_PARAM = 32;
// Past the longest real slug, which is ten characters.
const MAX_VALUE_LENGTH = 64;

// The comma-separated values of one param, bounded and deduplicated before
// anything is looked up. An empty one is dropped rather than kept: ?zavetisce=,
// used to parse to a single "" shelter, which no animal has, so the page went
// to nothing matching behind a chip with no words on it and no way to reason
// about what was on.
function paramValues(params: URLSearchParams, name: string): string[] {
  // getAll and not get: this codec writes one param carrying a comma list, but
  // a URL is free to repeat a param instead, and hand-edited and hand-built
  // links do. get() returns only the first, so ?spol=samec&spol=samica quietly
  // filtered on samec alone. Joining the repeats reads both shapes as the one
  // list they mean, and the dedup below covers a value written in both.
  //
  // No empty-string guard: an absent or empty param splits to [""], which the
  // length filter drops, so the empty case already lands on [].
  const raw = params.getAll(name).join(",");
  return [
    ...new Set(
      raw
        .split(",")
        .map((value) => value.trim())
        .filter(
          (value) => value.length > 0 && value.length <= MAX_VALUE_LENGTH,
        ),
    ),
  ].slice(0, MAX_VALUES_PER_PARAM);
}

export function parseFilters(search: string): Filters {
  const params = new URLSearchParams(search);
  const slug = params.get("vrsta");
  // The legacy lookup keeps links shared before a species tab was folded into
  // "other" filtering the way they used to, near enough: ?vrsta=zajcek now
  // opens the whole small-animal tab.
  const species: SpeciesFilter =
    SPECIES_TAB_ORDER.find((tab) => SPECIES_TAB_SLUGS[tab] === slug) ??
    (slug === null ? undefined : LEGACY_TAB_SLUGS[slug]) ??
    "all";
  // No second dedupe below: paramValues has already made the slugs unique, and
  // every slug-to-value lookup here is one-to-one.
  const values = (group: MultiGroup): string[] =>
    paramValues(params, PARAM_NAMES[group])
      .map((slug) => fromSlug(group, slug))
      .filter((value): value is string => value !== undefined);
  const toggles = paramValues(params, "lastnosti").filter(
    (slug): slug is ToggleKey => TOGGLES.some((t) => t.key === slug),
  );
  const codedValues = (group: ValueGroup): string[] =>
    paramValues(params, VALUE_PARAM_NAMES[group])
      .map((slug) => valueFromSlug(group, slug))
      .filter((value): value is string => value !== undefined);
  return pruneHiddenFilters({
    species,
    sex: values("sex") as Sex[],
    age: values("age") as AgeGroup[],
    size: values("size") as AnimalSize[],
    energy: values("energy") as EnergyLevel[],
    shelter: values("shelter"),
    toggles,
    goodWith: codedValues("goodWith") as GoodWithKey[],
    home: codedValues("home") as HomeKey[],
    care: codedValues("care") as CareKey[],
  });
}

export function activeFilterCount(filters: Filters): number {
  return (
    GROUPS.reduce((sum, group) => sum + filters[group].length, 0) +
    filters.toggles.length +
    filters.goodWith.length +
    filters.home.length +
    filters.care.length
  );
}

/** The same count as far as the filter panel is concerned, which is every
 *  section it actually holds. Zavetišče is not one of them: the panel is built
 *  from GROUPS minus shelter (animal-grid.tsx), because where you adopt from is
 *  a map and it lives in the location picker, whose own trigger already says
 *  how many shelters are on. Counted here as well, the Filtri badge promised
 *  sections the sheet does not have, and on a tab with no sheet at all it was a
 *  number over a control nobody can open. */
export function panelFilterCount(filters: Filters): number {
  return activeFilterCount(filters) - filters.shelter.length;
}

/** Whether toggling these values would take them off rather than add them.
 *  Exported because callers need the answer before the toggle runs: the map
 *  picker asks it to tell a click that drops from a click that picks, and a
 *  second copy of the rule there would be free to drift from this one. */
export function isDrop(
  selected: readonly string[],
  values: readonly string[],
): boolean {
  return values.every((value) => selected.includes(value));
}

export function toggleValues(
  selected: readonly string[],
  values: readonly string[],
): string[] {
  if (isDrop(selected, values)) {
    return selected.filter((value) => !values.includes(value));
  }
  return [...new Set([...selected, ...values])];
}
