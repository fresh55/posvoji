import type { Animal } from "@posvoji/schema";

// Shelters sometimes fill the "kraj najdbe" field on their sites with an
// owner-surrender phrase instead of a place: "Oddana s strani lastnika",
// "oddana s strani skrbnikov", or just "oddan". The provider parsers pass
// the field through verbatim, and the web UI renders originMunicipality as
// a place name next to a map pin, so those phrases read wrong. Both muri
// and zonzani have emitted them, so the rule lives here as a shared ingest
// step rather than in each parser.
//
// Every observed phrase starts with a form of the verb "oddati" (oddan,
// oddana, oddani, oddano). No Slovenian municipality or settlement name
// starts with "oddan", so the prefix alone is a safe test.
const OWNER_SURRENDER = /^oddan/i;

export function normalizeOriginMunicipality(
  value: string | undefined,
): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  if (trimmed === "" || OWNER_SURRENDER.test(trimmed)) return undefined;
  return trimmed;
}

// Returns the animal unchanged when its originMunicipality is already a
// place; otherwise returns a copy without the field. The key is dropped
// rather than set to undefined so the animal serializes the same as one
// that never had it.
export function normalizeAnimalOrigin(animal: Animal): Animal {
  const normalized = normalizeOriginMunicipality(animal.originMunicipality);
  if (normalized === animal.originMunicipality) return animal;
  const { originMunicipality: _dropped, ...rest } = animal;
  return normalized === undefined
    ? rest
    : { ...rest, originMunicipality: normalized };
}
