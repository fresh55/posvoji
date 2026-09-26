import type { LifeStage, Species } from "@posvoji/schema";
import { stayStart, type AnimalFields } from "@/lib/animal";
import {
  TAB_OF_SPECIES,
} from "@/lib/species";
import {
  CARE_KEYS,
  EMPTY_FILTERS,
  FILTER_TOGGLE_KEYS,
  GOOD_WITH_KEYS,
  GROUPS,
  SINGLE_CHOICE_GROUPS,
  TOGGLE_KEYS,
  filterColour,
  type AgeGroup,
  type WaitingGroup,
  type CareKey,
  type FilterFacet,
  type Filters,
  type GoodWithKey,
  type MultiGroup,
  type SpeciesFilter,
  type ToggleKey,
} from "./contracts";
import {
  FILTER_METADATA,
  TOGGLES,
  toggleAsks,
  type ToggleDef,
} from "./metadata";

/** Every value the filter state holds, zavetišče included. The panels used to
 *  count a narrower set: shelter had no section in either of them, so a badge
 *  counting it promised a control the sheet did not hold. Both panels open
 *  with a Kje row now, so there is one count again and it is this one. */
export function activeFilterCount(filters: Filters): number {
  return (
    GROUPS.reduce((sum, group) => sum + filters[group].length, 0) +
    filters.toggles.length +
    filters.goodWith.length +
    filters.care.length
  );
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

/** One value switched on or off within a group. A single-choice group swaps
 *  its answer rather than adding a second one beside it. */
export function toggleGroupValue(
  group: MultiGroup,
  selected: readonly string[],
  value: string,
): string[] {
  if (selected.includes(value)) {
    return selected.filter((selectedValue) => selectedValue !== value);
  }
  return SINGLE_CHOICE_GROUPS.includes(group) ? [value] : [...selected, value];
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

/** The shelter's answer to one household question, or undefined for none.
 *  An animal that has to be the only pet answers the two animal questions
 *  with a no, whatever its goodWith says: "Doma imam: Mačko" is the question
 *  such a visitor asks, and it has to rule the animal out on its own. */
export function goodWithAnswer(
  animal: AnimalFields,
  key: GoodWithKey,
): "yes" | "no" | undefined {
  if (key !== "kids" && animal.adoptionRequirements?.onlyPet === true) {
    return "no";
  }
  const answer = animal.goodWith?.[key];
  return answer === "yes" || answer === "no" ? answer : undefined;
}

/** Only a recorded yes counts, so "unknown" and no both drop out. */
export function goodWithMatches(animal: AnimalFields, key: GoodWithKey): boolean {
  return goodWithAnswer(animal, key) === "yes";
}

// An animal is asked what its own tab asks (groupFitsSpecies below), in a
// list that mixes species too. Velikost sorts dogs, but for cats it is a
// distinction nobody shops on, so a size a cat's listing happens to carry is
// not an answer to it: no cat answers it, and no cat is counted as leaving it
// unanswered either. Before, seven of the twelve animals "Majhna" brought on
// Vse were cats.
function groupAsks(group: MultiGroup, species: Species): boolean {
  return groupFitsSpecies(group, TAB_OF_SPECIES[species]);
}

/** Only a shelter that said so counts; an unanswered animal is not one.
 *
 *  Each animal answers the row of its most specific need. specialNeeds is the
 *  older, wider flag, and every animal needing daily care carried it too, so
 *  "Dnevno nego" ticked after "Potrpežljivost" added nothing and the
 *  count beside it said otherwise. Patience now holds the special-needs
 *  animals no narrower row claims, which also keeps an animal the shelter
 *  wants an experienced carer for out of a first-timer's patience row. The
 *  dialog's pill reads this same rule. */
export function careMatches(animal: AnimalFields, key: CareKey): boolean {
  const requires = animal.adoptionRequirements;
  switch (key) {
    case "patient":
      return (
        animal.specialNeeds === true &&
        requires?.ongoingCare !== true &&
        requires?.experiencedCarer !== true
      );
    case "bonded-pair":
      return requires?.bondedPair === true;
    case "ongoing-care":
      return requires?.ongoingCare === true;
    case "experienced-carer":
      return requires?.experiencedCarer === true;
  }
}

// Boundaries in months: under a year is a baby, past eight a senior. The
// schema's lifeStageOf draws the same lines for ingest. Importing it here
// would ship zod to the browser, so a test holds the two together instead.
const PUPPY_MAX_EXCLUSIVE = 12;
const ADULT_MAX_EXCLUSIVE = 96;

const GROUP_OF_STAGE: Record<LifeStage, AgeGroup> = {
  young: "mladicek",
  adult: "odrasel",
  senior: "senior",
};

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

/** The stage the filter files an animal under: from its age where one is
 *  known, otherwise from the stage the shelter stated without a number. The
 *  dialog and the poster read this too, so all three agree. */
export function ageStage(
  animal: {
    birthDate?: string;
    approximateAgeMonths?: number;
    lifeStage?: LifeStage;
  },
  now: Date,
): AgeGroup | undefined {
  const months = ageInMonths(animal, now);
  if (months !== undefined) return ageGroup(months);
  return animal.lifeStage && GROUP_OF_STAGE[animal.lifeStage];
}

function matchesSpecies(animal: AnimalFields, species: SpeciesFilter): boolean {
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

// One bit per group. Written out rather than derived, so a new group fails to
// compile here instead of quietly sharing a bit with one of these.
const GROUP_BITS: Record<MultiGroup, number> = {
  sex: 1 << 0,
  age: 1 << 1,
  size: 1 << 2,
  energy: 1 << 3,
  shelter: 1 << 4,
  coatColor: 1 << 5,
  coatLength: 1 << 6,
  waiting: 1 << 7,
};

type Column<Value> = readonly (Value | undefined)[];

/** The dataset as the filter reads it: one slot per animal, in the order the
 *  animals were given. Every column here is a property of the animal alone,
 *  which is what lets one index answer for any date. Age and the time in the
 *  shelter are the exceptions: each is held as its date-free half, and the
 *  answer for a date is worked out on demand and kept below. */
type FilterIndex = {
  readonly species: readonly Species[];
  readonly sex: Column<string>;
  readonly size: Column<string>;
  readonly energy: Column<string>;
  readonly coatColor: Column<string>;
  readonly coatLength: Column<string>;
  /** The intake date as the UTC instant of its midnight, read once rather
   *  than parsed again on every pass. */
  readonly intakeStart: Column<number>;
  readonly shelter: readonly string[];
  readonly approximate: Column<number>;
  readonly born: Column<number>;
  /** The stated stage, read only where neither of the two above answers. */
  readonly stage: Column<AgeGroup>;
  readonly toggles: readonly number[];
  readonly goodWith: readonly number[];
  readonly care: readonly number[];
  /** Beside the two AND sections' answers, which of their questions the record
   *  answers at all, yes or no. What a pick hides for want of an answer is
   *  read off these (TOGGLES_ASKED says which toggles a species is asked). */
  readonly togglesAnswered: readonly number[];
  readonly goodWithAnswered: readonly number[];
  /** The two columns a clock moves, kept for as long as the same month or
   *  day keeps being asked about: every question on a render asks the same
   *  one, so each is worked out once per render at most, and in practice
   *  once per visit. */
  ages: { at: number; values: Column<AgeGroup> } | null;
  waiting: {
    at: number | undefined;
    values: Column<readonly WaitingGroup[]>;
  } | null;
};

/** Which toggles each species is asked, as a mask over TOGGLES: a property
 *  of the species and not of the animal, so a table and not a column. A dog
 *  is not missing an FIV result. */
const askedOf = (species: Species) =>
  maskOf(TOGGLES.length, (bit) => toggleAsks(TOGGLES[bit], species));
const TOGGLES_ASKED: Record<Species, number> = {
  dog: askedOf("dog"),
  cat: askedOf("cat"),
  rabbit: askedOf("rabbit"),
  other: askedOf("other"),
};

function buildIndex(animals: readonly AnimalFields[]): FilterIndex {
  const species: Species[] = [];
  const sex: (string | undefined)[] = [];
  const size: (string | undefined)[] = [];
  const energy: (string | undefined)[] = [];
  const coatColor: (string | undefined)[] = [];
  const coatLength: (string | undefined)[] = [];
  const intakeStart: (number | undefined)[] = [];
  const shelter: string[] = [];
  const approximate: (number | undefined)[] = [];
  const born: (number | undefined)[] = [];
  const stage: (AgeGroup | undefined)[] = [];
  const toggles: number[] = [];
  const goodWith: number[] = [];
  const care: number[] = [];
  const togglesAnswered: number[] = [];
  const goodWithAnswered: number[] = [];
  for (const animal of animals) {
    species.push(animal.species);
    // "unknown" sex is semantically the same as absent: we do not know.
    sex.push(animal.sex === "unknown" ? undefined : animal.sex);
    size.push(groupAsks("size", animal.species) ? animal.size : undefined);
    energy.push(animal.energy);
    coatColor.push(filterColour(animal.coatColor));
    coatLength.push(animal.coatLength);
    intakeStart.push(intakeStartOf(stayStart(animal)?.date));
    shelter.push(animal.shelter.id);
    approximate.push(animal.approximateAgeMonths);
    born.push(bornAt(animal.birthDate));
    stage.push(animal.lifeStage && GROUP_OF_STAGE[animal.lifeStage]);
    toggles.push(maskOf(TOGGLES.length, (bit) => TOGGLES[bit].matches(animal)));
    goodWith.push(
      maskOf(GOOD_WITH_KEYS.length, (bit) =>
        goodWithMatches(animal, GOOD_WITH_KEYS[bit]),
      ),
    );
    care.push(
      maskOf(CARE_KEYS.length, (bit) => careMatches(animal, CARE_KEYS[bit])),
    );
    togglesAnswered.push(
      maskOf(TOGGLES.length, (bit) => TOGGLES[bit].answered(animal)),
    );
    goodWithAnswered.push(
      maskOf(
        GOOD_WITH_KEYS.length,
        (bit) => goodWithAnswer(animal, GOOD_WITH_KEYS[bit]) !== undefined,
      ),
    );
  }
  return {
    species,
    sex,
    size,
    energy,
    shelter,
    coatColor,
    coatLength,
    intakeStart,
    approximate,
    born,
    stage,
    toggles,
    goodWith,
    care,
    togglesAnswered,
    goodWithAnswered,
    ages: null,
    waiting: null,
  };
}

// One index per list, held weakly so a list the page has let go takes its
// index with it. Identity is the key, and that is what makes it safe: these
// lists come from an import or a memo and are never written to, and a list
// rebuilt from different animals is a different array with an index of its
// own. The page asks its eleven questions of the same two lists on every
// render, so in practice this builds twice per dataset and is read from
// thereafter.
const indexes = new WeakMap<readonly AnimalFields[], FilterIndex>();

function indexOf(animals: readonly AnimalFields[]): FilterIndex {
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
    return months === undefined ? index.stage[slot] : ageGroup(months);
  });
  index.ages = { at: nowMonths, values };
  return values;
}

/** The Čaka na dom thresholds each animal has passed by this day. undefined
 *  where there is no date to read, which is the question's one missing
 *  answer: an empty list is a known date under six months. The date is
 *  stayStart's, so a floor (intakeBy) passes a threshold only once its latest
 *  possible arrival has: it can read "not yet" a few weeks late, never "more". */
function waitingColumn(
  index: FilterIndex,
  today: number | undefined,
): Column<readonly WaitingGroup[]> {
  if (index.waiting !== null && index.waiting.at === today) {
    return index.waiting.values;
  }
  const values = index.intakeStart.map((start) =>
    intakeKnown(start, today) ? waitingFrom(start, today) : undefined,
  );
  index.waiting = { at: today, values };
  return values;
}

/** A selection resolved once per question rather than once per animal: the
 *  group choices as sets, the key sections as masks. */
type Query = {
  species: SpeciesFilter;
  groups: Record<MultiGroup, ReadonlySet<string> | null>;
  toggles: number;
  goodWith: number;
  care: number;
};

/**
 * Every answer Spol offers. Ticking all of them asks nothing: Samec and Samica
 * together read as "either", and matching them strictly hid the animals whose
 * sex nobody recorded (8 of 491) with no line saying so, since that share is
 * under the tenth UnansweredNote waits for. Spol alone, because its unknown is
 * the only one no visitor could mean to rule out; Starost with every stage
 * ticked still names what it leaves out.
 */
const SEX_ANSWERS: readonly string[] = FILTER_METADATA.sex.map(
  (option) => option.value,
);

/** Whether Spol has every answer ticked, and so asks nothing. Exported for
 *  the line under the section that says so. */
export function picksEverySex(sex: readonly string[]): boolean {
  return SEX_ANSWERS.every((value) => sex.includes(value));
}

function queryOf(filters: Filters): Query {
  // null and not an empty set: the difference between a section asking nothing
  // and a section asking for something no animal has.
  const chosen = (group: MultiGroup): ReadonlySet<string> | null =>
    filters[group].length === 0 ? null : new Set<string>(filters[group]);
  return {
    species: filters.species,
    groups: {
      sex: picksEverySex(filters.sex) ? null : chosen("sex"),
      age: chosen("age"),
      size: chosen("size"),
      energy: chosen("energy"),
      shelter: chosen("shelter"),
      coatColor: chosen("coatColor"),
      coatLength: chosen("coatLength"),
      waiting: chosen("waiting"),
    },
    toggles: maskOf(TOGGLES.length, (bit) =>
      filters.toggles.includes(TOGGLE_KEYS[bit]),
    ),
    goodWith: maskOf(GOOD_WITH_KEYS.length, (bit) =>
      filters.goodWith.includes(GOOD_WITH_KEYS[bit]),
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
  waiting: Column<readonly WaitingGroup[]>;
  query: Query;
};

function passOf(animals: AnimalFields[], filters: Filters, now: Date): Pass {
  const index = indexOf(animals);
  return {
    index,
    ages: ageColumn(index, monthsOf(now)),
    waiting: waitingColumn(index, todayOf(now)),
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
): string | readonly string[] | undefined {
  switch (group) {
    case "sex":
      return pass.index.sex[slot];
    case "age":
      return pass.ages[slot];
    case "size":
      return pass.index.size[slot];
    case "coatColor":
      return pass.index.coatColor[slot];
    case "coatLength":
      return pass.index.coatLength[slot];
    case "waiting":
      return pass.waiting[slot];
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
    if (!asValues(value).some((v) => chosen.has(v))) failed |= GROUP_BITS[group];
  }
  return failed;
}

/** OR within the section: any one of the picked keys is enough, and a section
 *  with nothing picked asks nothing. Lahko ponudim reads this way: offering
 *  more widens what the visitor can take on. */
function answersAny(answered: number, picked: number): boolean {
  return picked === 0 || (answered & picked) !== 0;
}

// Two sections AND rather than OR, Družba and Zdravje. The group sections offer
// alternatives of a single attribute, so widening them is what the visitor
// asked for. These are independent constraints: a family with a child and a
// dog needs both answered yes, and a visitor who ticks Brez FIV and Brez FeLV
// wants a cat tested negative for both, where an OR showed cats tested for
// one of them as that all-clear. What comes back is which picked facets went
// unanswered rather than merely whether any did, because the counters below
// have to tell one missing answer from two.
type AndSection = "goodWith" | "toggles";

function andFailedAt(pass: Pass, slot: number, section: AndSection): number {
  return pass.query[section] & ~pass.index[section][slot];
}

/** The bit when a mask holds exactly one, otherwise -1. */
function soleBit(mask: number): number {
  return mask !== 0 && (mask & (mask - 1)) === 0 ? 31 - Math.clz32(mask) : -1;
}

/** The sections that are not groups, all of them except the one being
 *  measured. Every counter below wants this and each wants a different line
 *  left out, which is the faceting rule: a number next to an option is what
 *  you get when you pick it, so everything applies except the axis being
 *  counted.
 *
 *  Družba and Zdravje are not among the axes that can be lifted here, and that
 *  is the AND exception showing through: an OR section drops whole, so
 *  measuring one means switching it off, while an AND section has to keep the
 *  facets it is not measuring, so sectionCounts measures those with nothing
 *  lifted. The groups are the caller's business too: facetCounts wants the
 *  mask of which ones failed, everyone else only wants it to be zero. */
function sectionsPass(
  pass: Pass,
  slot: number,
  lift: "care" | null,
): boolean {
  if (!speciesAt(pass, slot)) return false;
  // The two AND sections are the cheapest guards and the ones that reject
  // most, so they go ahead of the OR section.
  if (andFailedAt(pass, slot, "toggles") !== 0) return false;
  if (andFailedAt(pass, slot, "goodWith") !== 0) return false;
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

// Generic, because what comes back is what went in: the dataset's own animals
// on the server and the client projection of them in the grid (see
// lib/animal.ts). The filtering itself reads none of what the two differ on.
export function applyFilters<T extends AnimalFields>(
  animals: T[],
  filters: Filters,
  now: Date,
): T[] {
  const pass = passOf(animals, filters, now);
  return animals.filter(
    (_, slot) =>
      speciesAt(pass, slot) &&
      andFailedAt(pass, slot, "toggles") === 0 &&
      andFailedAt(pass, slot, "goodWith") === 0 &&
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
  animals: AnimalFields[],
  filters: Filters,
  now: Date,
): Record<MultiGroup, Map<string, number>> {
  const pass = passOf(animals, filters, now);
  const counts = {
    sex: new Map<string, number>(),
    age: new Map<string, number>(),
    size: new Map<string, number>(),
    energy: new Map<string, number>(),
    coatColor: new Map<string, number>(),
    coatLength: new Map<string, number>(),
    waiting: new Map<string, number>(),
    shelter: new Map<string, number>(),
  };
  for (let slot = 0; slot < lengthOf(pass); slot += 1) {
    if (!sectionsPass(pass, slot, null)) continue;
    const failed = groupsFailedAt(pass, slot);
    for (const group of GROUPS) {
      if ((failed & ~GROUP_BITS[group]) !== 0) continue;
      const value = valueAt(pass, slot, group);
      for (const item of asValues(value)) bump(counts[group], item);
    }
  }
  return counts;
}

// The number beside a key is what picking it leaves, like every counter here.
// Lahko ponudim ORs, so it is counted with the whole section lifted. The two
// AND sections cannot drop their axis to work that out: only the facet being
// measured comes off, the rest stay on, and the facet is then required on top
// of them. That is the animals passing every filter as it stands that also
// answer the facet, since an animal answering a facet cannot be failing on it;
// for a picked facet it is the result itself.
function sectionCounts(
  pass: Pass,
  section: AndSection | "care",
  keys: readonly string[],
): Map<string, number> {
  const counts = new Map<string, number>(keys.map((key) => [key, 0]));
  const lift = section === "care" ? "care" : null;
  for (let slot = 0; slot < lengthOf(pass); slot += 1) {
    if (!sectionsPass(pass, slot, lift)) continue;
    if (groupsFailedAt(pass, slot) !== 0) continue;
    const answered = pass.index[section][slot];
    for (let bit = 0; bit < keys.length; bit += 1) {
      if ((answered & (1 << bit)) !== 0) bump(counts, keys[bit]);
    }
  }
  return counts;
}

export function toggleCounts(
  animals: AnimalFields[],
  filters: Filters,
  now: Date,
): Map<string, number> {
  return sectionCounts(passOf(animals, filters, now), "toggles", TOGGLE_KEYS);
}

export function goodWithCounts(
  animals: AnimalFields[],
  filters: Filters,
  now: Date,
): Map<string, number> {
  return sectionCounts(passOf(animals, filters, now), "goodWith", GOOD_WITH_KEYS);
}

export function careCounts(
  animals: AnimalFields[],
  filters: Filters,
  now: Date,
): Map<string, number> {
  return sectionCounts(passOf(animals, filters, now), "care", CARE_KEYS);
}

/** Whether this animal answers a group's question at all: undefined is no
 *  answer in every column, Čaka na dom's included (waitingColumn). */
function answeredAt(pass: Pass, slot: number, group: MultiGroup): boolean {
  return valueAt(pass, slot, group) !== undefined;
}

/** How many animals a question was put to, and how many of them it has no
 *  answer from. */
export type Unanswered = { readonly asked: number; readonly unanswered: number };

export type UnansweredTally = {
  readonly groups: Readonly<Record<MultiGroup, Unanswered>>;
  readonly goodWith: Readonly<Record<GoodWithKey, Unanswered>>;
  readonly toggles: Readonly<Record<ToggleKey, Unanswered>>;
};

/** A tenth: past it, the animals a pick hides for want of an answer are a
 *  part of the list worth saying out loud, and short of it the line would sit
 *  under nearly every section saying almost nothing (Spol leaves out 8 of
 *  491). */
const UNANSWERED_SHARE = 0.1;

export function namesUnanswered({ asked, unanswered }: Unanswered): boolean {
  return unanswered > 0 && unanswered >= asked * UNANSWERED_SHARE;
}

/** Whether not one of the animals asked has an answer. Every option of the
 *  question then counts 0, since the counts are taken over the same animals,
 *  so there is nothing for the visitor to pick. /?zavetisce=turk: none of its
 *  18 animals has a date to read a wait from. */
export function answeredByNone(tally: Unanswered | undefined): boolean {
  return tally !== undefined && tally.asked > 0 && tally.unanswered === tally.asked;
}

/** Half: the share of the animals asked that a question has to leave
 *  unanswered before the empty state names it as the reason nothing matched.
 *  A tenth is worth a line under a section, but a question answered for 85%
 *  of the tab, as Starost is, is not why a combination came back empty. */
const EMPTY_REASON_SHARE = 0.5;

/** One AND section's facets into their tally, each measured with the rest
 *  of its section applied and put only to the animals `asked` marks. */
function tallyFacets<Key extends string>(
  into: Record<Key, { asked: number; unanswered: number }>,
  keys: readonly Key[],
  failed: number,
  asked: number,
  answered: number,
): void {
  for (let bit = 0; bit < keys.length; bit += 1) {
    if ((failed & ~(1 << bit)) !== 0) continue;
    if ((asked & (1 << bit)) === 0) continue;
    const count = into[keys[bit]];
    count.asked += 1;
    if ((answered & (1 << bit)) === 0) count.unanswered += 1;
  }
}

function zeroTally<Key extends string>(
  keys: readonly Key[],
): Record<Key, { asked: number; unanswered: number }> {
  return Object.fromEntries(
    keys.map((key) => [key, { asked: 0, unanswered: 0 }]),
  ) as Record<Key, { asked: number; unanswered: number }>;
}

/**
 * What each question leaves out for want of an answer: the animals a pick
 * there hides not because they answer otherwise but because nobody said.
 * "Otroke 8" can read as the other 483 not being good with children, when
 * 479 of them simply had no answer, and before a pick the panel said so only
 * in a tooltip a mouse has to find.
 *
 * Measured over the population the option's own count is measured over, which
 * is every filter applied but the question's own, so the two numbers stand
 * side by side and describe the same animals. A group lifts the whole group,
 * the faceting rule facetCounts follows. A facet of an AND section lifts only
 * itself: for a picked facet that is exactly the animals the pick is hiding
 * for no answer, and for an unpicked one it is the list as it stands.
 *
 * Asked is the part of that population the question is put to at all. A cat
 * is not asked its size (groupAsks), and a dog is not missing an FIV result.
 */
export function unansweredCounts(
  animals: AnimalFields[],
  filters: Filters,
  now: Date,
): UnansweredTally {
  const pass = passOf(animals, filters, now);
  const { index, query } = pass;
  const groups = zeroTally(GROUPS);
  const goodWith = zeroTally(GOOD_WITH_KEYS);
  const toggles = zeroTally(TOGGLE_KEYS);

  for (let slot = 0; slot < lengthOf(pass); slot += 1) {
    if (!speciesAt(pass, slot)) continue;
    if (!answersAny(index.care[slot], query.care)) continue;
    const groupsFailed = groupsFailedAt(pass, slot);
    const goodWithFailed = andFailedAt(pass, slot, "goodWith");
    const togglesFailed = andFailedAt(pass, slot, "toggles");

    if (goodWithFailed === 0 && togglesFailed === 0) {
      for (const group of GROUPS) {
        if ((groupsFailed & ~GROUP_BITS[group]) !== 0) continue;
        if (!groupAsks(group, index.species[slot])) continue;
        groups[group].asked += 1;
        if (!answeredAt(pass, slot, group)) groups[group].unanswered += 1;
      }
    }
    if (groupsFailed !== 0) continue;

    // Every household question is put to every animal.
    if (togglesFailed === 0) {
      tallyFacets(goodWith, GOOD_WITH_KEYS, goodWithFailed, ~0, index.goodWithAnswered[slot]);
    }
    if (goodWithFailed === 0) {
      tallyFacets(
        toggles,
        TOGGLE_KEYS,
        togglesFailed,
        TOGGLES_ASKED[index.species[slot]],
        index.togglesAnswered[slot],
      );
    }
  }
  return { groups, goodWith, toggles };
}

/** A question the visitor has answered, and how much of the species tab the
 *  shelters answered it for. A group is named by its facet; a facet of an
 *  AND section carries its key as well. */
export type Coverage =
  | {
      readonly facet: Exclude<MultiGroup, "shelter">;
      readonly asked: number;
      readonly answered: number;
    }
  | {
      readonly facet: "goodWith";
      readonly key: GoodWithKey;
      readonly asked: number;
      readonly answered: number;
    }
  | {
      readonly facet: "toggles";
      readonly key: ToggleKey;
      readonly asked: number;
      readonly answered: number;
    };

/**
 * Of the questions the visitor has answered, the one the shelters answered
 * for the smallest share of the species tab, when it leaves half the animals
 * asked or more without an answer (EMPTY_REASON_SHARE) and was asked of more
 * than one. The empty state says it, because "Ni zadetkov" under Psi, Otroke
 * and Mačko can read as no dog in the country being fine with children, when
 * 121 of the 124 had no answer at all.
 *
 * Over the tab alone, with nothing else applied: it describes the question
 * and not the combination. "3 of 124 dogs" is why a household filter came
 * back empty; "4 of the 5 that are also fine with cats" is a smaller truth
 * that reads as though there were only five dogs. With nothing but the tab
 * applied, what unansweredCounts says each question leaves out is exactly
 * that.
 *
 * Shelter is never it: every animal answers it.
 */
export function thinnestAnswer(
  animals: AnimalFields[],
  filters: Filters,
  now: Date,
): Coverage | undefined {
  const tab = unansweredCounts(
    animals,
    { ...EMPTY_FILTERS, species: filters.species },
    now,
  );
  const covered = ({ asked, unanswered }: Unanswered) => ({
    asked,
    answered: asked - unanswered,
  });

  const asked = queryOf(filters).groups;
  const candidates: Coverage[] = [];
  for (const group of GROUPS) {
    if (group === "shelter") continue;
    // A section the visitor ticked but that asks nothing (Spol with both)
    // cannot be why nothing matched.
    if (asked[group] === null) continue;
    candidates.push({ facet: group, ...covered(tab.groups[group]) });
  }
  for (const key of filters.goodWith) {
    candidates.push({ facet: "goodWith", key, ...covered(tab.goodWith[key]) });
  }
  for (const key of filters.toggles) {
    candidates.push({ facet: "toggles", key, ...covered(tab.toggles[key]) });
  }

  let thinnest: Coverage | undefined;
  for (const candidate of candidates) {
    const { asked, answered } = candidate;
    if (asked < 2 || asked - answered < asked * EMPTY_REASON_SHARE) continue;
    if (
      thinnest === undefined ||
      answered / asked < thinnest.answered / thinnest.asked
    ) {
      thinnest = candidate;
    }
  }
  return thinnest;
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
 *  Družba and Zdravje are the exception to both, because they AND: dropping a
 *  facet there only ever widens, by exactly the animals that fail that facet
 *  and nothing else. */
export function chipGains(
  animals: AnimalFields[],
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
    coatColor: 0,
    coatLength: 0,
    waiting: 0,
    shelter: 0,
  };
  let freedCare = 0;
  // The AND sections' facets are counted one by one, since dropping one of
  // them widens by itself rather than by emptying the section.
  const freedGoodWith = new Map<string, number>();
  const freedToggles = new Map<string, number>();
  // Inside the result, what each picked value is holding up on its own.
  const sole = new Map<string, number>();
  // Inside the result, how many of each sex, counted only for Spol with both
  // ticked, the one case that reads it.
  const everySex = picksEverySex(filters.sex);
  const sexShown = new Map<string, number>();

  for (let slot = 0; slot < lengthOf(pass); slot += 1) {
    if (!speciesAt(pass, slot)) continue;
    const groupsFailed = groupsFailedAt(pass, slot);
    const goodWithFailed = andFailedAt(pass, slot, "goodWith");
    const togglesFailed = andFailedAt(pass, slot, "toggles");
    const careOk = answersAny(index.care[slot], query.care);

    // A facet of an AND section is holding out exactly the animals that fail
    // it and nothing else, the other AND section included.
    if (careOk && groupsFailed === 0) {
      const household = soleBit(goodWithFailed);
      if (household >= 0 && togglesFailed === 0) {
        bump(freedGoodWith, GOOD_WITH_KEYS[household]);
      }
      const health = soleBit(togglesFailed);
      if (health >= 0 && goodWithFailed === 0) {
        bump(freedToggles, TOGGLE_KEYS[health]);
      }
    }
    if (goodWithFailed !== 0 || togglesFailed !== 0) continue;

    if (careOk) {
      for (const group of GROUPS) {
        if ((groupsFailed & ~GROUP_BITS[group]) === 0) freedGroup[group] += 1;
      }
    }
    if (groupsFailed !== 0) continue;

    // Measured with itself lifted, which for an OR section means the whole
    // section.
    freedCare += 1;
    if (!careOk) continue;

    // Everything passes, so this animal is in the result, and the result is
    // the only place a value can be the sole reason something is showing.
    result += 1;
    if (everySex) {
      const sex = index.sex[slot];
      if (sex !== undefined) bump(sexShown, sex);
    }
    for (const group of GROUPS) {
      const chosen = query.groups[group];
      if (chosen === null) continue;
      const value = valueAt(pass, slot, group);
      const matches = asValues(value).filter((v) => chosen.has(v));
      if (matches.length === 1) bump(sole, chipKey(group, matches[0]));
    }
    // An exact match on one bit is the test: this animal answers that value
    // and no other the section picked, so the value is holding it up alone.
    const need = soleBit(index.care[slot] & query.care);
    if (need >= 0) bump(sole, chipKey("care", CARE_KEYS[need]));
  }

  // A section with one value picked empties when that value comes off; a
  // section with more keeps asking, so what leaves is what only that value
  // was answering for.
  const price = (key: string, last: boolean, freed: number) => {
    gains.set(key, last ? freed - result : -(sole.get(key) ?? 0));
  };
  for (const group of GROUPS) {
    if (group === "sex" && everySex) continue;
    const chosen = filters[group];
    for (const value of chosen) {
      price(chipKey(group, value), chosen.length === 1, freedGroup[group]);
    }
  }
  // Spol with both ticked asks nothing (picksEverySex), so dropping one sex is
  // neither case above: the other becomes the whole question, and what
  // leaves is every animal shown that is not that sex, unknown included.
  if (everySex) {
    for (const value of filters.sex) {
      const kept = filters.sex
        .filter((other) => other !== value)
        .reduce((sum, other) => sum + (sexShown.get(other) ?? 0), 0);
      gains.set(chipKey("sex", value), kept - result);
    }
  }
  for (const key of filters.toggles) {
    gains.set(chipKey("toggles", key), freedToggles.get(key) ?? 0);
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
export function bySpecies<T extends AnimalFields>(
  animals: T[],
  species: SpeciesFilter,
): T[] {
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

/** Whether the panel offers this toggle as a filter at all, on any tab. */
function isFilterToggle(key: ToggleKey): boolean {
  return FILTER_TOGGLE_KEYS.includes(key);
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

// Selected controls always stay visible so they can be removed. By default,
// unselected controls must narrow the pool; includeUnavailable shows every
// species-appropriate control without inspecting the pool's answers.
export function visibleToggles(
  animals: AnimalFields[],
  species: SpeciesFilter,
  selected: readonly ToggleKey[],
  includeUnavailable = false,
): ToggleDef[] {
  const counts = includeUnavailable
    ? null
    : answeredCounts(indexOf(animals).toggles, TOGGLES.length);
  return TOGGLES.filter(
    (toggle, bit) =>
      isFilterToggle(toggle.key) &&
      (selected.includes(toggle.key) ||
        (toggleFitsSpecies(toggle.species, species) &&
          (counts === null || narrows(counts[bit], animals.length)))),
  );
}

/** Družba and Lahko ponudim ask one question of two different columns: which
 *  of this section's keys can still narrow the pool, plus whatever the visitor
 *  has already picked. One walk written once, the way narrows() above is the
 *  one place the narrowing rule itself is written. No species pinning in
 *  either: each question is asked of dogs and cats alike. */
function visibleFacet<Key extends string>(
  keys: readonly Key[],
  column: "goodWith" | "care",
  animals: AnimalFields[],
  selected: readonly Key[],
  includeUnavailable = false,
): Key[] {
  const counts = answeredCounts(indexOf(animals)[column], keys.length);
  if (includeUnavailable) {
    // Every key, zero rows included, for as long as the section is a question
    // at all. When no animal in the pool answers any of them the section has
    // nothing to say and goes whole, the way visibleGroups drops a group no
    // animal answers. A selection holds it open so it can be taken off.
    const answered = counts.some((count) => count > 0);
    return answered || selected.length > 0 ? [...keys] : [];
  }
  return keys.filter(
    (key, bit) =>
      selected.includes(key) ||
      narrows(counts[bit], animals.length),
  );
}

export function visibleGoodWith(
  animals: AnimalFields[],
  selected: readonly GoodWithKey[],
  includeUnavailable = false,
): GoodWithKey[] {
  return visibleFacet(GOOD_WITH_KEYS, "goodWith", animals, selected, includeUnavailable);
}

export function visibleCare(
  animals: AnimalFields[],
  selected: readonly CareKey[],
  includeUnavailable = false,
): CareKey[] {
  return visibleFacet(CARE_KEYS, "care", animals, selected, includeUnavailable);
}

/** The number each species tab shows: everything the visitor asked for
 *  applies except the species axis itself, because that is the axis the tab
 *  would set. The same rule facetCounts follows, and for the same reason a
 *  number next to an option has to be what you get when you press it.
 *
 *  Which is also why a tab is counted with the filters it keeps once pressed
 *  (pruneHiddenFilters): Mačke sheds Velikost, and every tab but Mačke sheds
 *  the cat-only toggles. Counted with them, Velikost picked on Vse left
 *  "Mačke 0" on the strip, since no cat answers a size, and pressing it gave
 *  every cat there is.
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
  animals: AnimalFields[],
  filters: Filters,
  now: Date,
): Record<SpeciesFilter, number> {
  const pass = passOf(animals, filters, now);
  // One query per tab, of the filters that tab keeps once pressed: the
  // columns are the same four times over, and only the question differs.
  const on = (tab: SpeciesFilter): Pass => ({
    ...pass,
    query: queryOf(pruneHiddenFilters({ ...filters, species: tab })),
  });
  const passes: Record<SpeciesFilter, Pass> = {
    all: on("all"),
    dog: on("dog"),
    cat: on("cat"),
    other: on("other"),
  };
  const passesOn = (tab: SpeciesFilter, slot: number) =>
    sectionsPass(passes[tab], slot, null) &&
    groupsFailedAt(passes[tab], slot) === 0;
  const counts: Record<SpeciesFilter, number> = {
    all: 0,
    dog: 0,
    cat: 0,
    other: 0,
  };
  for (let slot = 0; slot < lengthOf(pass); slot += 1) {
    if (passesOn("all", slot)) counts.all += 1;
    const tab = TAB_OF_SPECIES[pass.index.species[slot]];
    if (passesOn(tab, slot)) counts[tab] += 1;
  }
  return counts;
}

/** Every species the dataset holds, filters ignored. This is a roster and not
 *  a facet: it decides which tabs exist, the way the location picker's roster
 *  decides which shelters exist (animal-grid.tsx). A filter may move a tab's
 *  number, but it may not take the tab off the strip, or narrowing to "samica"
 *  would delete the way back to the other species. */
export function speciesCounts(animals: AnimalFields[]): Record<SpeciesFilter, number> {
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
  animals: AnimalFields[],
  filters: Filters,
  now: Date,
  includeUnavailable = false,
): Record<MultiGroup, boolean> {
  const index = indexOf(animals);
  const ages = ageColumn(index, monthsOf(now));
  const waiting = waitingColumn(index, todayOf(now));
  const distinct = {
    sex: new Set<string>(),
    age: new Set<string>(),
    size: new Set<string>(),
    energy: new Set<string>(),
    coatColor: new Set<string>(),
    coatLength: new Set<string>(),
    waiting: new Set<string>(),
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
    add("coatColor", index.coatColor[slot]);
    add("coatLength", index.coatLength[slot]);
    waiting[slot]?.forEach((v) => add("waiting", v));
    add("shelter", index.shelter[slot]);
  }
  // includeUnavailable drops the floor to one answer rather than lifting it
  // off the pool altogether. A section nobody in the pool answers is not a
  // section with a zero row in it, it is a column of disabled zeros with no
  // question behind it, and Energija and the care section were exactly that
  // on the live dataset. One answer is enough to keep the section, so the
  // zero rows beside it stay and explain the unknowns, and the section comes
  // back on its own the day the field arrives.
  const floor = includeUnavailable ? 1 : 2;
  const shown = (group: MultiGroup) =>
    filters[group].length > 0 ||
    (groupFitsSpecies(group, filters.species) &&
      distinct[group].size >= floor);
  return {
    sex: shown("sex"),
    age: shown("age"),
    size: shown("size"),
    energy: shown("energy"),
    coatColor: shown("coatColor"),
    coatLength: shown("coatLength"),
    waiting: shown("waiting"),
    shelter: shown("shelter"),
  };
}

/**
 * The options of a group the species pool can ever answer, with every other
 * filter set aside, plus whatever the visitor has already picked.
 *
 * A row can read 0 two ways. The current narrowing left nothing standing:
 * isDeadOption already answers that, and drawnOptions in filter-groups.tsx
 * only hides it from the sidebar's rows, because loosening another filter can
 * bring the option back, and the sheet's own tile still offers it for exactly
 * that reason. The other way is that the catalogue holds no such animal at
 * all, the way no animal is ever hairless: no pick anywhere else on the panel
 * can bring that option back, so neither surface should draw it. This is the
 * option-level twin of the rule visibleGroups already applies to a whole
 * section (PR #231, which stopped drawing a section the pool answers nothing
 * of); poolCounts below is that same pool, counted per option instead of
 * per section.
 *
 * A selection stays regardless of its pool count, the same reason isDeadOption
 * never calls a checked option dead: a value a shared link carries in still has
 * to be visible to take back off, even if the pool cannot ever produce it.
 */
export function liveInPool<Option extends { value: string }>(
  options: readonly Option[],
  poolCounts: ReadonlyMap<string, number>,
  selected: readonly string[],
): Option[] {
  return options.filter(
    (option) =>
      selected.includes(option.value) || (poolCounts.get(option.value) ?? 0) > 0,
  );
}

/** The counts liveInPool reads: every option's share of the species tab alone,
 *  with no other filter narrowing it. `pool` is already bySpecies(animals,
 *  filters.species), so this asks facetCounts for "all" species again rather
 *  than double-filtering, and for none of the other facets, which is what
 *  EMPTY_FILTERS is. */
export function poolCounts(
  pool: AnimalFields[],
  now: Date,
): Record<MultiGroup, Map<string, number>> {
  return facetCounts(pool, { ...EMPTY_FILTERS, species: "all" }, now);
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
    coatColor: filters.coatColor,
    coatLength: filters.coatLength,
    waiting: filters.waiting,
    shelter: keep("shelter") ? filters.shelter : [],
    // A toggle the panel no longer offers goes too, the same way: a link
    // shared while Cepljenje was a filter would otherwise go on narrowing with
    // no row to take it off.
    toggles: filters.toggles.filter(
      (key) =>
        isFilterToggle(key) &&
        toggleFitsSpecies(
          TOGGLES.find((t) => t.key === key)?.species,
          filters.species,
        ),
    ),
    // No facet here is pinned to a species, so nothing to prune: a selection
    // made on one tab still has a control on the next. The same holds for
    // Lahko ponudim below.
    goodWith: filters.goodWith,
    care: filters.care,
  };
}

function asValues(value: string | readonly string[] | undefined): readonly string[] {
  return value === undefined ? [] : typeof value === "string" ? [value] : value;
}

/** A stay's start date as the UTC instant of its midnight, or undefined for
 *  one that is not a real calendar date. */
function intakeStartOf(date: string | undefined): number | undefined {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return undefined;
  const start = new Date(date);
  if (!Number.isFinite(start.getTime()) || start.toISOString().slice(0, 10) !== date) return undefined;
  return start.getTime();
}

function todayOf(now: Date): number | undefined {
  if (!Number.isFinite(now.getTime())) return undefined;
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

/** Whether the waiting thresholds can be read from this start at all: a real
 *  date, not after today. */
function intakeKnown(
  start: number | undefined,
  today: number | undefined,
): start is number {
  return start !== undefined && today !== undefined && start <= today;
}

function waitingFrom(
  start: number | undefined,
  today: number | undefined,
): WaitingGroup[] {
  if (!intakeKnown(start, today) || today === undefined) return [];
  const date = new Date(start);
  const thresholds: [WaitingGroup, number][] = [["over-6-months", 6], ["over-1-year", 12], ["over-3-years", 36]];
  return thresholds.filter(([, months]) => {
    const month = date.getUTCMonth() + months;
    const lastDay = new Date(Date.UTC(date.getUTCFullYear(), month + 1, 0)).getUTCDate();
    return today > Date.UTC(date.getUTCFullYear(), month, Math.min(date.getUTCDate(), lastDay));
  }).map(([value]) => value);
}

/** Strictly past the calendar anniversary of the stay's start (stayStart).
 * Clamp month-end anniversaries (August 31 + 6 months is February's last day).
 * UTC date arithmetic makes shared links agree across visitor time zones. */
export function waitingGroups(date: string | undefined, now: Date): WaitingGroup[] {
  return waitingFrom(intakeStartOf(date), todayOf(now));
}
