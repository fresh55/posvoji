import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildMunicipalityEntries } from "./municipality-coverage";
import { loadMunicipalities } from "./municipalities";
import { loadShelters } from "./shelters";

vi.mock("./municipalities", () => ({ loadMunicipalities: vi.fn() }));
vi.mock("./shelters", () => ({ loadShelters: vi.fn() }));

beforeEach(() => {
  vi.mocked(loadShelters).mockReturnValue([
    {
      id: "ljubljana",
      name: "Zavetišče Ljubljana",
      city: "Ljubljana",
      phone: "01 256 02 79",
    },
    { id: "maribor", name: "Zavetišče Maribor", city: "Maribor" },
  ]);
  vi.mocked(loadMunicipalities).mockReturnValue({
    municipalities: [],
    sources: {},
  });
});

describe("municipality lookup fallback", () => {
  it.each([
    { shelter: "missing-shelter", source: "known-source" },
    { shelter: "ljubljana", source: "missing-source" },
  ])("keeps nearby contacts when an unusable coverage row is removed: %j", (row) => {
    vi.mocked(loadMunicipalities).mockReturnValue({
      municipalities: [{ name: "Ljubljana", coverage: [row] }],
      sources: {
        "known-source": { label: "Test", date: "2026-01-01", confirmed: true },
      },
    });

    const [entry] = buildMunicipalityEntries("en", []);

    expect(entry.coverage).toEqual([]);
    expect(entry.nearest.map((shelter) => shelter.shelterId)).toEqual([
      "ljubljana",
      "maribor",
    ]);
    expect(entry.nearest[0]).toMatchObject({
      phone: "01 256 02 79",
      detailHref: "/en/shelters/ljubljana",
    });
  });

  it("keeps valid responsibility separate from the nearby fallback", () => {
    vi.mocked(loadMunicipalities).mockReturnValue({
      municipalities: [{
        name: "Ljubljana",
        coverage: [
          { shelter: "ljubljana", source: "known-source" },
          { shelter: "missing-shelter", source: "known-source" },
        ],
      }],
      sources: {
        "known-source": { label: "Test", date: "2026-01-01", confirmed: true },
      },
    });

    const [entry] = buildMunicipalityEntries("sl", [{ shelter: { id: "ljubljana" } }]);

    expect(entry.coverage).toHaveLength(1);
    expect(entry.coverage[0]).toMatchObject({ shelterId: "ljubljana", animals: 1 });
    expect(entry.nearest).toEqual([]);
  });
});
