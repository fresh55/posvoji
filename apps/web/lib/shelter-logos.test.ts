import { beforeEach, describe, expect, it, vi } from "vitest";
import { logosFromEntries } from "./shelter-logos";

vi.mock("node:fs", () => ({
  existsSync: vi.fn(() => true),
  readFileSync: vi.fn(() => "{}"),
  statSync: vi.fn(() => ({ mtimeMs: 1 })),
}));

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

// Logo files are content-addressed and the ingest run sweeps the ones nothing
// references any more, so a manifest read before a sync names files that were
// deleted by it. Held forever, that answer outlives the files: a dev server
// that had rendered once went on serving the old names and every logo on the
// page 404ed until it was restarted.
describe("re-reading the manifest when it changes", () => {
  const manifest = (file: string) =>
    JSON.stringify({
      entries: {
        horjul: {
          file,
          width: 128,
          height: 40,
          chipOnLight: true,
          chipOnDark: false,
          opaque: false,
        },
      },
    });

  async function load() {
    vi.resetModules();
    return import("./shelter-logos");
  }

  beforeEach(async () => {
    const fs = await import("node:fs");
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.statSync).mockReturnValue({ mtimeMs: 1 } as never);
    vi.mocked(fs.readFileSync).mockReturnValue(manifest("old.webp"));
  });

  it("parses once while the file is untouched", async () => {
    const fs = await import("node:fs");
    const { getShelterLogos } = await load();

    expect(getShelterLogos()["horjul"]?.url).toContain("old.webp");
    getShelterLogos();
    getShelterLogos();

    expect(vi.mocked(fs.readFileSync)).toHaveBeenCalledTimes(1);
  });

  it("follows the file when the ingest run rewrites it", async () => {
    const fs = await import("node:fs");
    const { getShelterLogos } = await load();
    expect(getShelterLogos()["horjul"]?.url).toContain("old.webp");

    vi.mocked(fs.statSync).mockReturnValue({ mtimeMs: 2 } as never);
    vi.mocked(fs.readFileSync).mockReturnValue(manifest("new.webp"));

    expect(getShelterLogos()["horjul"]?.url).toContain("new.webp");
  });

  it("answers empty when there is no manifest to stat", async () => {
    const fs = await import("node:fs");
    vi.mocked(fs.statSync).mockImplementation(() => {
      throw new Error("ENOENT");
    });
    const { getShelterLogos } = await load();

    expect(getShelterLogos()).toEqual({});
  });
});
