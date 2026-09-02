// Turns whatever a user types into a location box (a postcode, a town name,
// half of a bilingual coastal name, a partial name, a pasted "1000 Ljubljana")
// into coordinates, using the postal-district table in lib/postal-districts.ts.
import { cityKey, type LatLon } from "./geo";
import { POSTAL_DISTRICTS, type PostalDistrict } from "./postal-districts";

export type PostalMatch = { at: LatLon; label: string; code: string };

const BY_CODE = new Map(POSTAL_DISTRICTS.map((d) => [d.code, d]));

type Entry = { key: string; district: PostalDistrict };

// The districts whose "X - Y" name is one place under two languages: Italian
// on the coast, Hungarian in Prekmurje. Both halves name the same place, so
// both halves are keys and "ancarano" finds Ankaran - Ancarano.
//
// Every other " - " name in the table is a single Slovene name spelled in two
// parts, and half of one is not a name for that place. Splitting those made
// "videm" resolve to 1312 Videm - Dobrepolje, which is Videm in Občina
// Dobrepolje, while Občina Videm is 80 km east at Videm pri Ptuju. Someone
// standing over a found animal in Videm was handed Dobrepolje's shelter, named
// with the same confidence as a correct answer. The same split answered
// "šentvid" with Ljubljana and "polje" with Ljubljana.
//
// Keyed by code and not by name: the code is what the generated table is keyed
// on and does not move when a name is respelled. Regenerating
// postal-districts.ts with a new bilingual district means adding its code here.
const BILINGUAL_CODES = new Set([
  "6000", // Koper - Capodistria
  "6280", // Ankaran - Ancarano
  "6310", // Izola - Isola
  "6320", // Portorož - Portorose
  "6330", // Piran - Pirano
  "6333", // Sečovlje - Sicciole
  "9205", // Hodoš - Hodos
  "9207", // Prosenjakovci - Pártosfalva
  "9220", // Lendava - Lendva
  "9223", // Dobrovnik - Dobronak
]);

// One entry per district name, plus one per half of a bilingual name.
const ENTRIES: Entry[] = POSTAL_DISTRICTS.flatMap((district) => {
  const names = BILINGUAL_CODES.has(district.code)
    ? district.name.split(" - ")
    : [district.name];
  return names.map((name) => ({ key: cityKey(name), district }));
});

function toMatch(district: PostalDistrict): PostalMatch {
  return {
    at: { lat: district.lat, lon: district.lon },
    label: district.name,
    code: district.code,
  };
}

// Exact match wins outright. Otherwise a prefix match is only used if every
// entry it hits belongs to the same district, so "lju" stays ambiguous but a
// name typed in full, or unique enough, still resolves.
//
// Among exact hits a district whose whole name is the typed word beats one that
// only carries it as half of a longer name: "ljubljana" is 1000 Ljubljana and
// not one of the five "Ljubljana - X" districts, "smarje" is 6274 Šmarje and
// not Šmarje - Sap. When two districts are both named in full the same way
// (Šentrupert is both 3271 and 8232) there is no honest winner, so nothing is
// returned and the picker can say it did not find the place.
function findByKey(key: string): PostalDistrict | undefined {
  const exact = ENTRIES.filter((entry) => entry.key === key);
  if (exact.length > 0) {
    const whole = exact.filter((entry) => cityKey(entry.district.name) === key);
    const candidates = whole.length > 0 ? whole : exact;
    const districts = new Set(candidates.map((entry) => entry.district));
    return districts.size === 1 ? candidates[0].district : undefined;
  }

  const prefixed = ENTRIES.filter((entry) => entry.key.startsWith(key));
  if (prefixed.length === 0) return undefined;

  const districts = new Set(prefixed.map((entry) => entry.district));
  return districts.size === 1 ? prefixed[0].district : undefined;
}

// A pasted address carries its postcode next to the town: "1000 Ljubljana",
// "Ljubljana 1000", "SI-1000". The four digits are the precise half of all
// three, so they are what we read, and the rest is left alone. Anything that is
// not exactly four digits long is not a postcode and falls through to the name
// lookup.
const POSTCODE = /(?:^|\D)(\d{4})(?:\D|$)/;

function postcodeIn(text: string): string | undefined {
  const stripped = text.replace(/^si[-\s]?/i, "");
  return POSTCODE.exec(stripped)?.[1];
}

/** Whether the input reads as an attempt at a postcode at all. The picker uses
 *  it to choose which "not found" it says, so a wrong number is not answered
 *  with advice to try a number. */
export function looksLikePostcode(input: string): boolean {
  return postcodeIn(input.trim()) !== undefined;
}

/** Whether some district name starts with, but is longer than, what is typed.
 *  Half a name is not a mistake, it is a name in progress. */
export function hasPrefixMatch(input: string): boolean {
  const key = cityKey(input);
  if (!key) return false;
  return ENTRIES.some(
    (entry) => entry.key.length > key.length && entry.key.startsWith(key),
  );
}

export function lookupPostal(input: string): PostalMatch | undefined {
  const text = input.trim();
  if (!text) return undefined;

  const code = postcodeIn(text);
  if (code) {
    const district = BY_CODE.get(code);
    return district ? toMatch(district) : undefined;
  }

  const district = findByKey(cityKey(text));
  return district ? toMatch(district) : undefined;
}
