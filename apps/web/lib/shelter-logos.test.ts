import { describe, expect, it } from "vitest";
import { logosFromEntries } from "./shelter-logos";

// The manifest is written by the ingest run and read here, and the two travel
// separately: data/dist is restored from backups, copied between clones and
// written by whichever checkout the scheduled crawl runs from. A field this
// build does not recognise takes every logo off every page at once and says
// nothing, so both shapes are pinned here rather than left to a screenshot.
describe("reading the shelter logo manifest", () => {
  const entry = { file: "abc.webp", width: 128, height: 40 };

  it("takes the measured chip flags", () => {
    const logos = logosFromEntries({
      horjul: { ...entry, chipOnLight: true, chipOnDark: false },
    });

    expect(logos["horjul"]).toEqual({
      url: "/media/shelter-logos/abc.webp",
      chipOnLight: true,
      chipOnDark: false,
      opaque: false,
      width: 128,
      height: 40,
    });
  });

  it("carries the flag for a mark that brings its own background", () => {
    // A file with no transparency is its own plate: the site rounds its
    // corners instead of putting a chip behind a rectangle that is already
    // there. Absent from an older manifest it reads false, which is what
    // every logo cached before the flag existed was.
    const logos = logosFromEntries({
      sevnica: {
        ...entry,
        chipOnLight: false,
        chipOnDark: false,
        opaque: true,
      },
      horjul: { ...entry, chipOnLight: true, chipOnDark: false },
    });

    expect(logos["sevnica"]).toMatchObject({ opaque: true });
    expect(logos["horjul"]).toMatchObject({ opaque: false });
  });

  it("reads a manifest still carrying the older light-or-dark reading", () => {
    // "light" ink was the ink that needed a plate in light mode, which is
    // what chipOnLight says on its own now.
    const logos = logosFromEntries({
      "mala-hisa": { ...entry, tone: "light" },
      ljubljana: { ...entry, tone: "dark" },
    });

    expect(logos["mala-hisa"]).toMatchObject({
      chipOnLight: true,
      chipOnDark: false,
    });
    expect(logos["ljubljana"]).toMatchObject({
      chipOnLight: false,
      chipOnDark: true,
    });
  });

  it("skips an entry it cannot read and keeps the rest", () => {
    const logos = logosFromEntries({
      good: { ...entry, chipOnLight: false, chipOnDark: true },
      noChips: entry,
      noWidth: { file: "b.webp", height: 40, chipOnLight: false, chipOnDark: true },
    });

    expect(Object.keys(logos)).toEqual(["good"]);
  });
});
