import { describe, expect, it } from "vitest";
import {
  sourceFreshness,
  verificationDate,
  verificationTime,
} from "./source-freshness";

describe("source verification", () => {
  const now = Date.parse("2026-09-19T12:00:00Z");

  // An unreadable stamp is the one case the footnote words differently: it
  // prints "Čas preverjanja ni znan" in place of a date, and warns all the
  // same, because a check that cannot be read is not a recent one.
  it.each([undefined, "bad", "2026-09-19T12:05:01Z"])(
    "keeps an unreliable timestamp unknown: %s",
    (value) => {
      expect(sourceFreshness(value, now)).toEqual({ isOld: true, known: false });
    },
  );

  it("retains the 30-hour threshold and five-minute future tolerance", () => {
    expect(sourceFreshness("2026-09-18T06:00:00Z", now).isOld).toBe(false);
    expect(sourceFreshness("2026-09-18T05:59:59Z", now).isOld).toBe(true);
    expect(sourceFreshness("2026-09-19T12:05:00Z", now)).toEqual({
      isOld: false,
      known: true,
    });
  });

  it("does not confuse republication with a source check", () => {
    const published = Date.parse("2026-09-13T12:00:00Z");
    expect(sourceFreshness("2026-09-05T12:00:00Z", published).isOld).toBe(true);
    expect(sourceFreshness("2026-09-13T06:00:00Z", published).isOld).toBe(false);
    expect(sourceFreshness(undefined, published).isOld).toBe(true);
    expect(sourceFreshness("bad", published).isOld).toBe(true);
    expect(sourceFreshness("2026-09-14T06:00:00Z", published).isOld).toBe(true);
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
