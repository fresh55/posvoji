import { describe, expect, it } from "vitest";
import {
  CARE_KEYS,
  FILTER_METADATA,
  FILTER_PARAM_NAMES,
  GOOD_WITH_KEYS,
  HOME_KEYS,
  TOGGLES,
  TOGGLE_KEYS,
} from "../filters";

describe("filter module invariants", () => {
  it("keeps key contracts aligned with their canonical metadata", () => {
    expect(TOGGLE_KEYS).toEqual(TOGGLES.map(({ key }) => key));
    expect(GOOD_WITH_KEYS).toEqual(
      FILTER_METADATA.goodWith.map(({ value }) => value),
    );
    expect(HOME_KEYS).toEqual(
      FILTER_METADATA.home.map(({ value }) => value),
    );
    expect(CARE_KEYS).toEqual(
      FILTER_METADATA.care.map(({ value }) => value),
    );
  });

  it("keeps every URL token unambiguous inside its namespace", () => {
    const codedGroups = [
      "sex",
      "age",
      "size",
      "energy",
      "goodWith",
      "home",
      "care",
    ] as const;

    for (const group of codedGroups) {
      const slugs = FILTER_METADATA[group].map(({ slug }) => slug);
      expect(new Set(slugs).size, group).toBe(slugs.length);
    }

    const parameterNames = Object.values(FILTER_PARAM_NAMES);
    expect(new Set(parameterNames).size).toBe(parameterNames.length);
  });
});
