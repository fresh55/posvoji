import type { Animal } from "@posvoji/schema";

// "Mladiček" is written for an animal of a few months, and the listing keeps
// saying it long after. Six months from the animal's first known date is as
// long as a young stage is published; after that the age is unknown again
// until the shelter gives a number.
export const YOUNG_STAGE_MONTHS = 6;

export type LifeStageDrop = {
  animalId: string;
  reason: "age-known" | "young-expired";
};

/** One answer to "how old" per animal, settled against the export's clock: an
 *  age or a birth date wins over a stage, and a young stage needs an intake or
 *  finding date inside the window above. */
export function settleLifeStages(animals: readonly Animal[], reference: Date) {
  const dropped: LifeStageDrop[] = [];
  const settled = animals.map((animal): Animal => {
    if (animal.lifeStage === undefined) return animal;
    const reason: LifeStageDrop["reason"] | undefined =
      animal.approximateAgeMonths !== undefined || animal.birthDate !== undefined
        ? "age-known"
        : animal.lifeStage === "young" && !arrivedWithin(animal, reference)
          ? "young-expired"
          : undefined;
    if (reason === undefined) return animal;
    dropped.push({ animalId: animal.id, reason });
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- pulled out only to leave it behind
    const { lifeStage, ...rest } = animal;
    return rest;
  });
  return { animals: settled, dropped };
}

// The earlier of the two dates, so a finding long before the intake cannot
// stretch the window.
function arrivedWithin(animal: Animal, reference: Date): boolean {
  const first = [animal.foundDate, animal.intakeDate]
    .filter((date): date is string => date !== undefined)
    .sort()[0];
  if (first === undefined) return false;
  const until = new Date(`${first}T00:00:00Z`);
  until.setUTCMonth(until.getUTCMonth() + YOUNG_STAGE_MONTHS);
  return reference < until;
}
