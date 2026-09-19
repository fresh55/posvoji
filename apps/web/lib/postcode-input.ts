const POSTCODE = /(?:^|\D)(\d{4})(?:\D|$)/;

export function postcodeIn(text: string): string | undefined {
  const stripped = text.replace(/^si[-\s]?/i, "");
  return POSTCODE.exec(stripped)?.[1];
}

/** Whether the input reads as an attempt at a postcode at all. The picker uses
 *  it to choose which "not found" it says, so a wrong number is not answered
 *  with advice to try a number. */
export function looksLikePostcode(input: string): boolean {
  return postcodeIn(input.trim()) !== undefined;
}
