// Compatibility facade. Consumers keep one stable import path while the
// implementation stays separated by responsibility below.
export {
  CARE_KEYS,
  EMPTY_FILTERS,
  FILTER_FACETS,
  GOOD_WITH_KEYS,
  GROUPS,
  HOME_KEYS,
  TOGGLE_KEYS,
} from "./filters/contracts";
export type {
  AgeGroup,
  CareKey,
  FilterFacet,
  FilterOption,
  Filters,
  GoodWithKey,
  HomeKey,
  MultiGroup,
  SpeciesFilter,
  ToggleKey,
} from "./filters/contracts";

export {
  FILTER_METADATA,
  TOGGLES,
  careOptions,
  goodWithOptions,
  groupLabel,
  groupOptions,
  homeOptions,
  optionLabel,
  toggleLabel,
  togglesAskedOf,
} from "./filters/metadata";
export type {
  FilterValueDefinition,
  ToggleDef,
} from "./filters/metadata";

export {
  activeFilterCount,
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
  homeCounts,
  homeMatches,
  isDrop,
  pruneHiddenFilters,
  speciesCounts,
  speciesFacetCounts,
  toggleCounts,
  toggleValues,
  visibleCare,
  visibleGoodWith,
  visibleGroups,
  visibleHome,
  visibleToggles,
} from "./filters/engine";

export {
  FILTER_PARAM_NAMES,
  parseFilters,
  serializeFilters,
  shelterAnimalsPath,
} from "./filters/url";
