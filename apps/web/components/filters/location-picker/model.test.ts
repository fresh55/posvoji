import { describe, expect, it } from "vitest";
import { parseFilters } from "@/lib/filters";
import { matchesFirst, pickerFilterSummary } from "./model";

describe("matchesFirst", () => {
  const rows = ["a", "b", "c", "d"].map((value) => ({ value }));

  it("lists the rows the filters leave animals in first, each group in its order", () => {
    const counts = new Map([["b", 0], ["c", 4], ["a", 0], ["d", 1]]);

    expect(matchesFirst(rows, counts).map((row) => row.value)).toEqual([
      "c",
      "d",
      "a",
      "b",
    ]);
  });

  it("changes nothing while every row has animals", () => {
    const counts = new Map(rows.map(({ value }) => [value, 2]));

    expect(matchesFirst(rows, counts)).toEqual(rows);
  });
});

describe("pickerFilterSummary", () => {
  it("says nothing while no filter narrows the counts", () => {
    expect(pickerFilterSummary(parseFilters(""), "sl")).toBe("");
  });

  it("names the species and counts the other filters once one narrows", () => {
    expect(pickerFilterSummary(parseFilters("?vrsta=macka"), "sl")).not.toBe("");
    expect(
      pickerFilterSummary(parseFilters("?vrsta=macka&spol=samica"), "sl"),
    ).toContain("Dodatni filtri: 1");
  });
});
