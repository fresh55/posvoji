import { describe, expect, it } from "vitest";
import { formatDatasetDate } from "@/components/site-page";

// Rendering the whole page needs a real dataset on disk (loadDataset,
// loadShelters, getShelterLogos all read from data/), so this exercises the
// one thing task 5 actually changed as a small pure function instead of
// pulling in that fixture surface.
describe("formatDatasetDate", () => {
  const date = new Date("2026-08-20T00:00:00Z");

  it("leaves the Slovenian date exactly as it always rendered", () => {
    expect(formatDatasetDate(date, "sl")).toBe(
      date.toLocaleDateString("sl-SI"),
    );
  });

  it("spells the English date with a short month instead of en-GB's slashes", () => {
    const formatted = formatDatasetDate(date, "en");
    expect(formatted).toBe("20 Aug 2026");
    expect(formatted).not.toContain("/");
  });
});
