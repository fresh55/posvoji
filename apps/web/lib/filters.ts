// Compatibility facade. Consumers keep one stable import path while the
// implementation stays separated by responsibility below.
export {
  CARE_KEYS,
  EMPTY_FILTERS,
  FILTER_FACETS,
  GOOD_WITH_KEYS,
  GROUPS,
  SINGLE_CHOICE_GROUPS,
  TOGGLE_KEYS,
  TWO_TONED,
} from "./filters/contracts";
export type {
  AgeGroup,
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
  type CareOptionDef,
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
} from "./filters/engine";

export {
  FILTER_PARAM_NAMES,
  parseFilters,
  serializeFilters,
  shelterAnimalsPath,
} from "./filters/url";
