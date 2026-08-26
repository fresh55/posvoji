import { describe, expect, it } from "vitest";
import { PREHYDRATION_FILTER_SCRIPT } from "./prehydration-script";

// The script ships as source and runs in the document before React does, so the
// only honest way to check it is to run the source, against the two things it
// reads: a location and a documentElement to mark.
function marks(search: string): boolean {
  const documentElement = { dataset: {} as Record<string, string> };
  const run = new Function("location", "document", PREHYDRATION_FILTER_SCRIPT);
  run({ search }, { documentElement });
  return "filtering" in documentElement.dataset;
}

describe("the pre-hydration filter script", () => {
  it("marks an address that carries a filter", () => {
    expect(marks("?spol=samec")).toBe(true);
    expect(marks("?vrsta=ostalo&spol=samec")).toBe(true);
    expect(marks("?zavetisce=muri")).toBe(true);
    expect(marks("?druzba=otroci")).toBe(true);
  });

  it("marks a sort too, which reorders the same first screen", () => {
    expect(marks("?razvrsti=najmlajsi")).toBe(true);
  });

  it("leaves every other address alone", () => {
    expect(marks("")).toBe(false);
    expect(marks("?")).toBe(false);
    // Not this codec's param, and not this codec's business.
    expect(marks("?najdena=1")).toBe(false);
  });
});
