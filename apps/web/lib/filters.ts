// Compatibility facade. Consumers keep one stable import path while the
// implementation stays separated by responsibility below.
export {
  CARE_KEYS,
  EMPTY_FILTERS,
  FILTER_FACETS,
  FILTER_TOGGLE_KEYS,
  GOOD_WITH_KEYS,
  GROUPS,
  TOGGLE_KEYS,
  TWO_TONED,
} from "./filters/contracts";
export type {
  AgeGroup,
  Availability,
  CoatColorFacet,
  WaitingGroup,
  CareKey,
  FilterFacet,
  FilterOption,
  Filters,
  GoodWithKey,
  MultiGroup,
  SpeciesFilter,
  ToggleKey,
} from "./filters/contracts";

export {
  FILTER_METADATA,
  TOGGLES,
  careOptions,
  type CareOption,
  goodWithOptions,
  groupLabel,
  groupOptions,
  optionLabel,
  toggleLabel,
  togglesAskedOf,
  valueChipLabel,
} from "./filters/metadata";
export type {
  FilterValueDefinition,
  ToggleDef,
} from "./filters/metadata";

export {
  activeFilterCount,
  waitingGroups,
  ageGroup,
  ageInMonths,
  applyFilters,
  bySpecies,
  careCounts,
  careMatches,
  chipGains,
  chipKey,
  facetCounts,
  namesUnanswered,
  thinnestAnswer,
  unansweredCounts,
  goodWithCounts,
  goodWithMatches,
  isDrop,
  pruneHiddenFilters,
  speciesCounts,
  speciesFacetCounts,
  toggleCounts,
  toggleGroupValue,
  toggleValues,
  visibleCare,
  visibleGoodWith,
  visibleGroups,
  visibleToggles,
  type Coverage,
  type Unanswered,
  type UnansweredTally,
} from "./filters/engine";

export {
  FILTER_PARAM_NAMES,
  OWNED_PARAM_NAMES,
  parseFilters,
  serializeFilters,
  shelterAnimalsPath,
} from "./filters/url";
