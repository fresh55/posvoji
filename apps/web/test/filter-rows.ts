/**
 * Finding the two active-filter rows in a rendered tree.
 *
 * Not a `.test.` file, so vitest does not collect it. The row is mounted
 * twice, once per width, and only CSS separates the two: in flow under the
 * toolbar band below lg, and inside the sticky bar at lg (animal-filters.tsx).
 * jsdom draws both, so every query about one of them has to name which, and
 * two suites were spelling the same three selectors. The strip-layout helper
 * next door records what drifting copies cost: rename the slot or give the
 * sidebar a section of its own and one copy goes quietly wrong rather than
 * failing.
 */

/** Both rows. A section and not a role query: the sidebar's toggle groups
 *  come back as toolbars too, and these two are the only sections that are
 *  one (filter-chips.tsx). */
export function chipRows(scope: ParentNode = document): HTMLElement[] {
  return [...scope.querySelectorAll<HTMLElement>("section[role='toolbar']")];
}

/** The row in flow, which is the one a phone reads. */
export function phoneRow(scope: ParentNode = document): HTMLElement {
  const row = scope.querySelector<HTMLElement>(
    '[data-slot="mobile-filter-row"]',
  );
  if (!row) throw new Error("no phone filter row on the page");
  return row;
}

/** The row inside the sticky band, named as the one the phone's row does not
 *  hold: the band's row wears no slot of its own. */
export function stickyRow(scope: ParentNode = document): HTMLElement {
  const phone = phoneRow(scope);
  const row = chipRows(scope).find((candidate) => !phone.contains(candidate));
  if (!row) throw new Error("no chips row in the sticky bar");
  return row;
}

/**
 * A pill in one of those rows, by the filter it names.
 *
 * The pill is one button in both placements, the press that takes its filter
 * off (filter-chips.tsx), so it is found by that name.
 */
export function chipPill(label: string, scope: ParentNode = document): HTMLElement {
  const name = `Remove filter ${label}`;
  const exact = scope.querySelector<HTMLElement>(`[aria-label="${name}"]`);
  if (exact) return exact;
  // The pill worth dropping says in its name what dropping it gives back.
  const withGain = scope.querySelector<HTMLElement>(`[aria-label^="${name}: "]`);
  if (!withGain) throw new Error(`no chip named "${name}"`);
  return withGain;
}
