// Parsed ages feed Animal.approximateAgeMonths, a non-negative safe integer.
// A figure large enough to leave that range ("751100010001000 let") is a typo
// or an unrelated number, and must not fail validation for the whole record.
export function wholeMonths(months: number | undefined): number | undefined {
  return months !== undefined && Number.isSafeInteger(months) && months >= 0
    ? months
    : undefined;
}
