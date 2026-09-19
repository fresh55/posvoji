const POSTCODE = /(?:^|\D)(\d{4})(?:\D|$)/;

/** Read four-digit postcodes, including pasted addresses and SI-prefixed codes. */
export function postcodeIn(text: string): string | undefined {
  const stripped = text.replace(/^si[-\s]?/i, "");
  return POSTCODE.exec(stripped)?.[1];
}

/** Choose the postcode-specific "not found" message for the picker. */
export function looksLikePostcode(input: string): boolean {
  return postcodeIn(input.trim()) !== undefined;
}
