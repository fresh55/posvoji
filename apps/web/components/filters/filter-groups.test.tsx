import { describe, expect, it } from "vitest";
import { drawnOptions } from "./filter-groups";

describe("the options a filter list draws", () => {
  // The sidebar draws the live options only: a row that answers nothing pushed
  // a section that does below the panel's own fold, 160 of the 243px it
  // overflowed at 1280x720 under /?vrsta=pes. The sheet keeps the tile, where
  // there is a page to scroll and a 0 to read.
  it("draws only the live options in the sidebar", () => {
    const options = ["a", "b", "c"];
    const dead = (option: string) => option !== "b";

    expect(drawnOptions(options, "sidebar", dead)).toEqual(["b"]);
    expect(drawnOptions(options, "sheet", dead)).toEqual(options);
  });

  // A section must not fold down to a bare heading, and it can: the section
  // survives on the species pool while its counts are taken against the whole
  // filter state, so one section's narrowing can zero every option of another.
  it("keeps one option when every option is dead", () => {
    expect(drawnOptions(["a", "b"], "sidebar", () => true)).toEqual(["a"]);
  });
});
