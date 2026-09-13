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
 * an ambiguous "number / number" pair. The registry rejects the latter;
 * this formatter preserves the separator so it cannot join two numbers.
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

/** Keep URL delimiters and percent escapes in an address literal. These can
 *  occur in a valid mailbox name, but must not become mail headers or another
 *  recipient when a mail client reads the URL. */
export function mailtoHref(email: string): string {
  return `mailto:${encodeURIComponent(email).replace(/%40/g, "@")}`;
}

/**
 * A shelter's website as the part of it worth reading: the scheme and the www
 * are on every one of them, and a trailing slash says nothing.
 *
 * Here beside telNumber for the reason telNumber was split out of telHref:
 * three surfaces print this string and they cannot be allowed to come to
 * different answers about the same shelter. The register card shows it,
 * the shelter page speaks it as the site link's accessible name, and the
 * found-animal coverage card shows it again. Read as a label by all three,
 * never as a URL: the href is always the registry's own value, which
 * lib/shelters.ts has already held to http or https.
 */
export function websiteHost(url: string): string {
  return url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
}

/**
 * The accessible name of a contact link, as all three surfaces say it: the
 * channel, then the value the link already prints.
 *
 * The visible label is the number or the address, so the name adds the
 * channel in front of it rather than replacing it, which is what WCAG 2.5.3
 * asks of a control with a visible label.
 */
export function contactName(channel: string, value: string): string {
  return `${channel}: ${value}`;
}

/**
 * The same for the one contact that leaves the site, and the half of this
 * pair that carries an invariant.
 *
 * It takes the URL rather than the host so the two facts a site link keeps
 * losing cannot be remembered separately: the name is read from the trimmed
 * host, and it ends with the new-window sentence because target="_blank"
 * announces nothing on its own. Three components wrote this name out by hand
 * and the third of them trimmed the host and dropped the sentence. A caller
 * that cannot half-call it is the point.
 */
export function websiteName(
  channel: string,
  url: string,
  newWindow: string,
): string {
  return `${contactName(channel, websiteHost(url))} ${newWindow}`;
}
