/**
 * Institutional contact details as the URLs a browser dials or opens.
 *
 * Pure string work in a module of its own, for the same reason
 * lib/shelter-path.ts is: a client component asking for one of these must not
 * drag anything heavier in behind it.
 */

/** Slovenia. Every entry in the register is a Slovenian institution, so the
 *  country code is a fact about this dataset and not something a number has
 *  to be parsed for. It is the only reason this file knows anything about
 *  phone numbering, and the reason it needs no library to. */
const COUNTRY_CODE = "386";

/** A national number as the register writes it once its grouping is gone: the
 *  trunk prefix 0, then the eight digits a Slovenian geographic or mobile
 *  number has. Both shapes in data/shelters.yaml land here, the landlines
 *  ("07 496 11 56") and the mobiles ("031 326 877"), because the two differ
 *  only in where the register puts the spaces. */
const NATIONAL = /^0(\d{8})$/;

/**
 * A registry phone number as a tel: URL. The spaces come out because the
 * registry writes numbers the way they are read aloud ("03 749 06 00") and a
 * dialler wants the digits.
 *
 * The digits on their own are not enough. A tel: URL in national form dials
 * only on a handset whose own default region is Slovenia, so a visitor
 * roaming on a foreign SIM gets a failed call out of the register's primary
 * mobile action, which is phoning a shelter about a stray they have just
 * found. Tourists finding strays here are a real part of who this page is
 * for. The href is therefore E.164: the trunk prefix 0 is dropped and +386
 * takes its place. Only the href changes. The card and the detail page keep
 * printing the number the way the register writes it, which is the form a
 * Slovenian reader recognises and reads back down the line.
 *
 * A number already written in international form is passed through, so
 * running this over an entry that carries its own +386 does not prefix it
 * twice.
 *
 * A number matching no shape above is handed back with its grouping removed
 * and nothing else done to it, which is what this function did to every
 * number before. An unrecognised entry then still dials for the local
 * visitors it already worked for, instead of being guessed into an
 * international number that reaches nobody. Two shapes deliberately fall
 * here: an 080 freephone, which has no international form to convert to, and
 * the "number / number" pair the register's own validator permits, where the
 * digits of two numbers must not be run together into one.
 */
export function telHref(phone: string): string {
  return `tel:${telNumber(phone)}`;
}

/**
 * The same number without the scheme, for a consumer that wants the value
 * rather than a link: the register's JSON-LD emits it as schema.org's
 * `telephone`, which is read by machines that cannot know which country's
 * numbering plan a grouped national number belongs to.
 *
 * Split out of telHref rather than duplicated, so the page's dial link and the
 * structured data it publishes beside it cannot come to different answers
 * about the same shelter.
 */
export function telNumber(phone: string): string {
  // Grouping only. The register separates with spaces and its validator also
  // admits brackets and hyphens, none of which carry meaning. A slash does
  // carry meaning, so it stays in and carries its number to the fallback.
  const compact = phone.replace(/[\s()-]/g, "");

  if (/^\+\d+$/.test(compact)) return compact;
  // 00 is the same number with a trunk-out prefix in front of the country
  // code, which is what a + is short for.
  if (/^00\d+$/.test(compact)) return `+${compact.slice(2)}`;

  const national = NATIONAL.exec(compact);
  if (national) return `+${COUNTRY_CODE}${national[1]}`;

  return compact;
}

/** A registry address as a mailto: URL. Nothing is stripped or prefixed: an
 *  address has no local form to expand, and the register validates the shape
 *  before it gets here. */
export function mailtoHref(email: string): string {
  return `mailto:${email}`;
}
