import { describe, expect, it } from "vitest";
import {
  EARLIEST_BIRTH_DATE,
  MAX_AGE_MONTHS,
  TEXT_LIMITS,
  isPlausibleBirthDate,
  limited,
  localIsoDate,
  parseAgeBoxes,
} from "@/components/portal/portal-fields";

describe("parseAgeBoxes", () => {
  it("adds the two boxes up into months", () => {
    expect(parseAgeBoxes("2", "3")).toEqual({ months: 27, error: null });
    expect(parseAgeBoxes("", "18")).toEqual({ months: 18, error: null });
    expect(parseAgeBoxes("2", "")).toEqual({ months: 24, error: null });
  });

  it("reads two empty boxes as no age", () => {
    expect(parseAgeBoxes("", "")).toEqual({ months: null, error: null });
  });

  it("names the box that is not a count", () => {
    expect(parseAgeBoxes("1.5", "")).toEqual({ months: null, error: "years" });
    expect(parseAgeBoxes("", "-3")).toEqual({ months: null, error: "months" });
  });

  it("takes an age right up to the cap", () => {
    expect(parseAgeBoxes("100", "")).toEqual({
      months: MAX_AGE_MONTHS,
      error: null,
    });
  });

  it("refuses an age past the cap at the box that carried it over", () => {
    // The years alone are past a hundred: the years box.
    expect(parseAgeBoxes("101", "")).toEqual({ months: null, error: "years" });
    expect(parseAgeBoxes("5000", "0")).toEqual({
      months: null,
      error: "years",
    });
    // A plausible year count that the months push over: the months box.
    expect(parseAgeBoxes("100", "1")).toEqual({
      months: null,
      error: "months",
    });
    expect(parseAgeBoxes("", "1201")).toEqual({
      months: null,
      error: "months",
    });
  });
});

describe("isPlausibleBirthDate", () => {
  const now = new Date(2026, 8, 6, 15, 30);

  it("treats an empty box as no answer, not a fault", () => {
    expect(isPlausibleBirthDate("", now)).toBe(true);
  });

  it("takes any real day between 1900 and today", () => {
    expect(isPlausibleBirthDate(EARLIEST_BIRTH_DATE, now)).toBe(true);
    expect(isPlausibleBirthDate("2020-02-29", now)).toBe(true);
    expect(isPlausibleBirthDate("2026-09-06", now)).toBe(true);
  });

  it("refuses tomorrow", () => {
    expect(isPlausibleBirthDate("2026-09-07", now)).toBe(false);
  });

  it("refuses the day before 1900", () => {
    expect(isPlausibleBirthDate("1899-12-31", now)).toBe(false);
    // A year the browser pads to four digits is what the date box hands over
    // for a year typed as "1".
    expect(isPlausibleBirthDate("0001-01-01", now)).toBe(false);
  });

  it("refuses a day the calendar does not have", () => {
    expect(isPlausibleBirthDate("2021-02-29", now)).toBe(false);
    expect(isPlausibleBirthDate("2020-13-01", now)).toBe(false);
  });

  it("refuses anything that is not an ISO day", () => {
    // The date box cannot produce these, but a draft read back from storage
    // can hold anything.
    expect(isPlausibleBirthDate("31 02 2020", now)).toBe(false);
    expect(isPlausibleBirthDate("2020-2-1", now)).toBe(false);
    expect(isPlausibleBirthDate("2020-02-01T00:00:00", now)).toBe(false);
  });

  it("measures today in the local calendar, not UTC", () => {
    // Late in the evening in Ljubljana the UTC day is still the same, but
    // the check has to read the local one: the box the shelter fills in
    // shows local dates.
    expect(localIsoDate(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
    expect(localIsoDate(new Date(2026, 11, 31, 0, 1))).toBe("2026-12-31");
  });
});

describe("limited", () => {
  it("cuts to the limit before trimming", () => {
    // The cut lands on a space, which the trim then takes off.
    expect(limited("ab cd", 3)).toBe("ab");
    expect(limited("  ab  ", 10)).toBe("ab");
  });

  it("is null for nothing", () => {
    expect(limited("", 10)).toBeNull();
    expect(limited("   ", 10)).toBeNull();
  });

  it("matches the API's own limits", () => {
    expect(TEXT_LIMITS).toEqual({ name: 200, breed: 200, shortDescription: 2000 });
  });
});
