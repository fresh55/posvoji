import { Animal } from "@posvoji/schema";
import type {
  OverrideFields,
  PortalExportPayload,
  PortalOverride,
} from "./portal-contract";

// A source moving away from the recorded baseline either creates a real
// disagreement or makes the correction redundant because the crawl caught up.
export type ConflictKind = "moved" | "caught-up";

export interface OverrideConflict {
  providerId: string;
  animalId: string;
  field: keyof OverrideFields;
  kind: ConflictKind;
  baseline: unknown;
  crawled: unknown;
  override: unknown;
  recordedAt?: string;
}

export interface ApplyOverridesResult {
  animals: Animal[];
  applied: PortalOverride[];
  unmatched: PortalOverride[];
  conflicts: OverrideConflict[];
}

// Pair the provider with the animal id in case ids are ever reused across
// providers. Keep the separator escaped so this source remains a text file.
function overrideKey(providerId: string, animalId: string): string {
  return `${providerId}\u0000${animalId}`;
}

const goodWithGroups = {
  goodWithKids: "kids",
  goodWithDogs: "dogs",
  goodWithCats: "cats",
} as const;

function crawledValue(animal: Animal, field: keyof OverrideFields): unknown {
  const group = goodWithGroups[field as keyof typeof goodWithGroups];
  const value =
    group === undefined
      ? (animal as unknown as Record<string, unknown>)[field]
      : animal.goodWith?.[group];
  return value === undefined ? null : value;
}

function conflictsFor(
  animal: Animal,
  override: PortalOverride,
): OverrideConflict[] {
  const { baseline } = override;
  if (!baseline) return [];

  const conflicts: OverrideConflict[] = [];
  for (const [field, value] of Object.entries(override.fields)) {
    if (!(field in baseline)) continue;
    const key = field as keyof OverrideFields;
    const base = baseline[key] ?? null;
    const crawled = crawledValue(animal, key);
    if (crawled === base) continue;
    conflicts.push({
      providerId: override.providerId,
      animalId: override.animalId,
      field: key,
      kind: crawled === value ? "caught-up" : "moved",
      baseline: base,
      crawled,
      override: value,
      ...(override.recordedAt ? { recordedAt: override.recordedAt } : {}),
    });
  }
  return conflicts;
}

function mergeFields(animal: Animal, fields: OverrideFields): unknown {
  const { goodWithKids, goodWithDogs, goodWithCats, ...flat } = fields;
  const merged: Record<string, unknown> = { ...animal, ...flat };

  if (
    goodWithKids !== undefined ||
    goodWithDogs !== undefined ||
    goodWithCats !== undefined
  ) {
    merged["goodWith"] = {
      ...animal.goodWith,
      ...(goodWithKids !== undefined ? { kids: goodWithKids } : {}),
      ...(goodWithDogs !== undefined ? { dogs: goodWithDogs } : {}),
      ...(goodWithCats !== undefined ? { cats: goodWithCats } : {}),
    };
  }

  return merged;
}

export function applyOverrides(
  animals: Animal[],
  payload: PortalExportPayload,
): ApplyOverridesResult {
  const knownKeys = new Set(
    animals.map((animal) => overrideKey(animal.source.providerId, animal.id)),
  );

  const overrideByKey = new Map<string, PortalOverride>();
  const unmatched: PortalOverride[] = [];
  for (const override of payload.overrides) {
    const key = overrideKey(override.providerId, override.animalId);
    if (!knownKeys.has(key)) {
      unmatched.push(override);
      continue;
    }
    overrideByKey.set(key, override);
  }

  for (const override of unmatched) {
    console.warn(
      `portal: override for ${override.providerId}/${override.animalId} has no matching animal, skipped`,
    );
  }

  const applied: PortalOverride[] = [];
  const conflicts: OverrideConflict[] = [];
  const overridden = animals.map((animal) => {
    const override = overrideByKey.get(
      overrideKey(animal.source.providerId, animal.id),
    );
    if (!override) return animal;
    applied.push(override);
    conflicts.push(...conflictsFor(animal, override));
    // Re-validate the merged record at the public dataset boundary.
    return Animal.parse(mergeFields(animal, override.fields));
  });

  return { animals: overridden, applied, unmatched, conflicts };
}
