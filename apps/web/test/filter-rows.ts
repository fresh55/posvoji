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
 * The three ways to name a pill in one of those rows.
 *
 * Beside the panel a pill is two controls in one shape: the label half goes to
 * the section that set the filter, the cross takes it off, and the shape
 * around them is the span carrying the pill's ground and border
 * (filter-chips.tsx). In flow it is one button and `cross` is the whole of it.
 * Spelled by hand, the walk up to the shape drifted between two suites the
 * first time the pill grew a level.
 */
export function chipStop(label: string, scope: ParentNode = document): HTMLElement {
  return control(scope, `Show filter ${label}`);
}

export function chipCross(label: string, scope: ParentNode = document): HTMLElement {
  return control(scope, `Remove filter ${label}`);
}

/** The shape both halves sit in, found from whichever of them is drawn. */
export function chipPill(label: string, scope: ParentNode = document): HTMLElement {
  const half =
    scope.querySelector<HTMLElement>(`[aria-label="Show filter ${label}"]`) ??
    chipCross(label, scope);
  // In flow the button is the pill; there is no shape around it to find.
  return half.closest("span") ?? half;
}

function control(scope: ParentNode, name: string): HTMLElement {
  const exact = scope.querySelector<HTMLElement>(`[aria-label="${name}"]`);
  if (exact) return exact;
  // The pill worth dropping says in its name what dropping it gives back.
  const withGain = scope.querySelector<HTMLElement>(`[aria-label^="${name}: "]`);
  if (!withGain) throw new Error(`no chip control named "${name}"`);
  return withGain;
}
