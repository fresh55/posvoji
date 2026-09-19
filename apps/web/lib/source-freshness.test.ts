import { describe, expect, it } from "vitest";
import {
  sourceFreshness,
  verificationDate,
  verificationTime,
} from "./source-freshness";

describe("source verification", () => {
  const now = Date.parse("2026-09-19T12:00:00Z");

  it.each([
    ["2026-09-18T05:00:00Z", "sl", "pred 31 urami"],
    ["2026-09-18T05:00:00Z", "en", "31 hours ago"],
    ["2026-09-17T12:00:01Z", "en", "47 hours ago"],
    ["2026-09-17T12:00:00Z", "sl", "pred 2 dnevoma"],
    ["2026-09-17T12:00:00Z", "en", "2 days ago"],
    ["2026-09-07T12:00:00Z", "sl", "pred 12 dnevi"],
    ["2026-09-07T12:00:00Z", "en", "12 days ago"],
  ] as const)("formats elapsed verification age for %s in %s", (value, locale, expected) => {
    expect(sourceFreshness(value, locale, now)).toEqual({ isOld: true, age: expected });
  });

  it.each([undefined, "bad", "2026-09-19T12:05:01Z"])(
    "keeps an unreliable timestamp unknown: %s",
    (value) => {
      expect(sourceFreshness(value, "en", now)).toEqual({ isOld: true, age: null });
    },
  );

  it("retains the 30-hour threshold and five-minute future tolerance", () => {
    expect(sourceFreshness("2026-09-18T06:00:00Z", "en", now).isOld).toBe(false);
    expect(sourceFreshness("2026-09-18T05:59:59Z", "en", now).isOld).toBe(true);
    expect(sourceFreshness("2026-09-19T12:05:00Z", "en", now)).toEqual({
      isOld: false,
      age: "0 hours ago",
    });
  });

  it("does not confuse republication with a source check", () => {
    const published = Date.parse("2026-09-13T12:00:00Z");
    expect(sourceFreshness("2026-09-05T12:00:00Z", "en", published).isOld).toBe(true);
    expect(sourceFreshness("2026-09-13T06:00:00Z", "en", published).isOld).toBe(false);
    expect(sourceFreshness(undefined, "en", published).isOld).toBe(true);
    expect(sourceFreshness("bad", "en", published).isOld).toBe(true);
    expect(sourceFreshness("2026-09-14T06:00:00Z", "en", published).isOld).toBe(true);
  });
  it("shows time and the Ljubljana date across a UTC day boundary", () => {
    expect(verificationTime("2026-09-13T23:30:00Z", "en")).toContain("14 Sept 2026");
    expect(verificationTime("2026-09-13T23:30:00Z", "en")).toContain("01:30");
    expect(verificationTime("2026-09-13T23:30:00Z", "sl")).toContain("Ljubljana");
  });
  // The animal's footnote. Same Ljubljana day as the line above, without the
  // hour or the timezone, and numeric in Slovenian so no month has to be
  // declined into a sentence Intl cannot write.
  it("gives the animal footnote the Ljubljana date and nothing else", () => {
    expect(verificationDate("2026-09-13T23:30:00Z", "sl")).toBe("14. 9. 2026");
    expect(verificationDate("2026-09-13T23:30:00Z", "en")).toBe("14 Sept 2026");
    expect(verificationDate("bad", "sl")).toBe("—");
  });
});
