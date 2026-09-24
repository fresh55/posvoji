import { Animal } from "@posvoji/schema";
import { describe, expect, it } from "vitest";
import { settleLifeStages } from "./life-stage";

const NOW = "2026-09-24T10:00:00.000Z";
function animal(patch: Partial<Animal> = {}): Animal {
  return Animal.parse({
    id: "fixture:1", species: "cat", status: "available",
    source: { providerId: "fixture", sourceAnimalId: "1", sourceUrl: "https://shelter.example/1",
      fetchedAt: NOW, firstSeenAt: NOW, lastSeenAt: NOW },
    shelter: { id: "fixture", name: "Fixture shelter", city: "Fixture town" },
    images: [], attribution: "Fixture shelter", ...patch,
  });
}
const settle = (patch: Partial<Animal>) => settleLifeStages([animal(patch)], new Date(NOW));

describe("settleLifeStages", () => {
  it("keeps an adult or senior stage with no date to anchor it", () => {
    expect(settle({ lifeStage: "adult" }).animals[0]?.lifeStage).toBe("adult");
    expect(settle({ lifeStage: "senior" }).animals[0]?.lifeStage).toBe("senior");
  });

  it("drops a stage beside an age or a birth date", () => {
    const aged = settle({ lifeStage: "senior", approximateAgeMonths: 30 });
    expect(aged.animals[0]).not.toHaveProperty("lifeStage");
    expect(aged.dropped).toEqual([{ animalId: "fixture:1", reason: "age-known" }]);
    expect(settle({ lifeStage: "adult", birthDate: "2020-01-01" }).animals[0])
      .not.toHaveProperty("lifeStage");
  });

  it("keeps a young stage for six months after the animal's first known date", () => {
    expect(settle({ lifeStage: "young", intakeDate: "2026-06-17" }).animals[0]?.lifeStage).toBe("young");
    expect(settle({ lifeStage: "young", intakeDate: "2026-03-25" }).animals[0]?.lifeStage).toBe("young");
    const expired = settle({ lifeStage: "young", intakeDate: "2026-03-24" });
    expect(expired.animals[0]).not.toHaveProperty("lifeStage");
    expect(expired.dropped).toEqual([{ animalId: "fixture:1", reason: "young-expired" }]);
  });

  it("drops a young stage with no date, and reads the earlier of found and intake", () => {
    expect(settle({ lifeStage: "young" }).animals[0]).not.toHaveProperty("lifeStage");
    expect(settle({ lifeStage: "young", foundDate: "2025-12-01", intakeDate: "2026-07-01" }).animals[0])
      .not.toHaveProperty("lifeStage");
  });

  it("leaves an animal without a stage untouched", () => {
    const plain = animal({ approximateAgeMonths: 5 });
    expect(settleLifeStages([plain], new Date(NOW)).animals[0]).toBe(plain);
  });
});
