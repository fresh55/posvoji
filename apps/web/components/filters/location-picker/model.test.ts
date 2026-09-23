import { describe, expect, it } from "vitest";
import { parseFilters } from "@/lib/filters";
import { pickerFilterSummary } from "./model";

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
