/**
 * Institutional contact details as the URLs a browser dials or opens.
 *
 * Pure string work in a module of its own, for the same reason
 * lib/shelter-path.ts is: a client component asking for one of these must not
 * drag anything heavier in behind it.
 */

/**
 * A registry phone number as a tel: URL. The spaces come out because the
 * registry writes numbers the way they are read aloud ("03 749 06 00") and a
 * dialler wants the digits.
 */
export function telHref(phone: string): string {
  return `tel:${phone.replace(/\s+/g, "")}`;
}

/** A registry address as a mailto: URL. */
export function mailtoHref(email: string): string {
  return `mailto:${email}`;
}
