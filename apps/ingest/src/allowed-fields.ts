import { Animal } from "@posvoji/schema";
import type { ProviderPolicy } from "@posvoji/schema";

// Every key the Animal schema knows. Read off the schema rather than written
// out here so a new field cannot be added upstream and quietly become
// unlistable in a policy.
export const ANIMAL_FIELDS: ReadonlySet<string> = new Set(
  Object.keys(Animal.shape),
);

// Fields that are not content a shelter grants us: they identify the animal,
// say which shelter and which crawl it came from, name the species the site
// filed it under, carry the adoption status the whole site is built to show,
// and credit the source. Stripping any of them would leave a record the
// schema rejects or the site cannot attribute, so allowedFields never gates
// them and a policy that leaves them out is not saying "drop these".
//
// images is deliberately not here. It is required by the schema, but it is
// the shelter's photographs, which is exactly the kind of content a grant is
// about, so an unlisted images ships as an empty array instead.
export const STRUCTURAL_FIELDS: ReadonlySet<string> = new Set([
  "id",
  "source",
  "shelter",
  "species",
  "status",
  "attribution",
]);

export interface StrippedField {
  providerId: string;
  field: string;
  count: number;
}

export interface AllowedFieldsResult {
  animals: Animal[];
  stripped: StrippedField[];
}

// Drops the fields a policy did not list from one animal. The result keeps
// the original key order, and the animal itself is returned untouched when
// there was nothing to strip, so an unaffected animal keeps its identity and
// its place in the change-set diff.
function stripAnimal(
  animal: Animal,
  allowed: ReadonlySet<string>,
  onStrip: (field: string) => void,
): Animal {
  const kept: Record<string, unknown> = {};
  let changed = false;

  for (const [key, value] of Object.entries(animal)) {
    if (STRUCTURAL_FIELDS.has(key) || allowed.has(key)) {
      kept[key] = value;
      continue;
    }
    // A key that is present but undefined carries nothing: it is absent from
    // the written JSON either way, so it is not counted as stripped data.
    if (value === undefined) continue;
    if (key === "images") {
      const images = value as Animal["images"];
      if (images.length === 0) {
        kept[key] = value;
        continue;
      }
      // images is required by the schema, so it empties rather than drops.
      kept[key] = [];
      onStrip(key);
      changed = true;
      continue;
    }
    // Every other field is optional: the key goes, rather than being set to
    // undefined, so the animal serializes like one that never had it.
    onStrip(key);
    changed = true;
  }

  return changed ? (kept as Animal) : animal;
}

// A policy's allowedFields is the shelter's own list of what we may publish.
// It was documentation until now, which meant a parser could start emitting a
// field nobody granted and nothing would notice. This is the backstop: a
// provider that declares a non-empty allowedFields ships those fields and the
// structural ones, and nothing else.
//
// A policy with no allowedFields, or an empty one, states no restriction and
// its animals pass through untouched.
export function applyAllowedFields(
  animals: readonly Animal[],
  policies: ReadonlyMap<string, ProviderPolicy>,
): AllowedFieldsResult {
  const counts = new Map<string, StrippedField>();

  const result = animals.map((animal) => {
    const providerId = animal.source.providerId;
    const declared = policies.get(providerId)?.allowedFields;
    if (!declared || declared.length === 0) return animal;
    const allowed = new Set(declared);
    return stripAnimal(animal, allowed, (field) => {
      const key = `${providerId}\n${field}`;
      const entry = counts.get(key) ?? { providerId, field, count: 0 };
      entry.count++;
      counts.set(key, entry);
    });
  });

  const stripped = [...counts.values()].sort(
    (a, b) =>
      a.providerId.localeCompare(b.providerId) || a.field.localeCompare(b.field),
  );
  return { animals: result, stripped };
}
