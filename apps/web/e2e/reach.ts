import { type Locator, type Page } from "@playwright/test";

// Whether a thumb landing on a control reaches it, in one place.
//
// Not a convenience. Every one of these encodes the same fact about how this
// site draws touch targets: several controls are drawn smaller than 44px on
// purpose and grow an invisible ::after instead (the tap-target utility in
// globals.css), so a computed height and a class assertion both pass on a
// target that something else is drawn over, and both pass on a tap-target
// whose layer a scroll container has clipped away. document.elementFromPoint
// is the only one of the three that answers the question being asked.
//
// It was written four times before this file existed: twice in
// shelter-picker.spec.ts, once in shelter-picker-landscape.spec.ts and once in
// shelters-register.spec.ts, each with its own spelling of the viewport-bounds
// guard and its own literal 44. picker.ts, next door, exists for exactly this
// reason and its header says what happened last time: copied into each spec,
// they went out of step the first time one of those facts moved.
//
// Not a .spec.ts, so Playwright's default testMatch leaves it alone.

/** What both platforms ask of a touch target, and what WCAG 2.5.5 wants at
 *  AAA. A caller asserting a lower floor should say why at the call site: the
 *  picker's fold trigger takes 36 on purpose, because a full 44 on all three
 *  rows of that header would push it past the sheet's budget. */
export const MIN_TARGET = 44;

/**
 * A control's drawn box and whether it takes presses along its own vertical
 * midline: at the centre, and two pixels inside each end.
 *
 * The ends are not padding on the assertion. A row overlapped by a neighbour
 * or clipped by a scroll container keeps a passing centre and loses an edge,
 * which is exactly the failure this class of bug produces, so a centre-only
 * probe reports the target as sound.
 *
 * The floor stays with the caller, because which floor is right is an argument
 * about the control rather than about the measurement.
 */
export async function reachedBox(target: Locator): Promise<{
  width: number;
  height: number;
  centre: boolean;
  top: boolean;
  bottom: boolean;
}> {
  return target.evaluate((el) => {
    const box = el.getBoundingClientRect();
    const probe = (x: number, y: number) => {
      const hit = document.elementFromPoint(x, y);
      return hit === el || el.contains(hit);
    };
    const midline = box.x + box.width / 2;
    return {
      width: box.width,
      height: box.height,
      centre: probe(midline, box.y + box.height / 2),
      top: probe(midline, box.y + 2),
      bottom: probe(midline, box.y + box.height - 2),
    };
  });
}

/** Whether a control is on screen at all and takes its own centre. False for
 *  a zero-sized box and for one scrolled out of the viewport, both of which
 *  cannot be hit-tested rather than being unreachable. */
export async function isReachable(target: Locator): Promise<boolean> {
  return target.evaluate((el) => {
    const box = el.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) return false;
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) return false;
    const hit = document.elementFromPoint(x, y);
    return hit === el || el.contains(hit);
  });
}

/** One undersized control: what it is called, and the target it actually
 *  offers. Both zero when something else owns its centre, which is a worse
 *  fault than being small and is reported rather than skipped. */
export type SmallTarget = { name: string; width: number; height: number };

/**
 * Every control on screen whose real target is under `min`, measured by
 * walking out from its centre until the point stops belonging to it.
 *
 * The walk is what makes a tap-target measurable: the layer overhangs the
 * drawing, so the brand is drawn 119x40 and answers to 44, and reading the
 * box would fail it. It also means the numbers are centred on the drawn box,
 * so a layer that is not centred on its host measures short.
 *
 * Controls that are not being offered yet are out of scope and skipped: a
 * transparent or aria-hidden control, and an sr-only one, which is a clipped
 * box no thumb is meant to find. They would otherwise report a covered centre
 * and be filed as zero-sized targets.
 */
export async function undersizedTargets(
  page: Page,
  min: number = MIN_TARGET,
): Promise<{ failures: SmallTarget[]; measured: number }> {
  return page.evaluate((minimum) => {
    const named = (element: Element) =>
      (element.getAttribute("aria-label") || element.textContent || "?")
        .trim()
        .slice(0, 40);

    const failures: SmallTarget[] = [];
    let measured = 0;

    for (const element of document.querySelectorAll("a[href], button")) {
      const box = element.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) continue;
      const x = box.left + box.width / 2;
      const y = box.top + box.height / 2;
      if (x < 0 || x >= window.innerWidth) continue;
      if (y < 0 || y >= window.innerHeight) continue;

      const style = getComputedStyle(element);
      if (Number.parseFloat(style.opacity) === 0) continue;
      if (element.closest("[aria-hidden='true']")) continue;
      // sr-only, read off the clip rather than off the box: a skip link that
      // also carries padding for its focused state measures 24 by 16, which
      // no size check would recognise as hidden. Tailwind v4 spells it
      // clip-path: inset(50%); the older clip: rect(0,0,0,0) is what most
      // other utility classes use, v3's own included.
      if (style.clipPath === "inset(50%)") continue;
      if (style.clip === "rect(0px, 0px, 0px, 0px)") continue;

      const owns = (px: number, py: number) => {
        const hit = document.elementFromPoint(px, py);
        return !!hit && (hit === element || element.contains(hit));
      };
      if (!owns(x, y)) {
        failures.push({ name: named(element), width: 0, height: 0 });
        continue;
      }

      const reach = (dx: number, dy: number) => {
        let step = 0;
        while (
          step < minimum &&
          owns(x + dx * (step + 1), y + dy * (step + 1))
        ) {
          step += 1;
        }
        return step;
      };
      const width = reach(-1, 0) + reach(1, 0) + 1;
      const height = reach(0, -1) + reach(0, 1) + 1;

      measured += 1;
      if (width < minimum || height < minimum) {
        failures.push({ name: named(element), width, height });
      }
    }

    return { failures, measured };
  }, min);
}
