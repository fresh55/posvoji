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
 *
 * The aria-hidden half of that has to earn itself, and for most of this
 * file's life it did not: any descendant of an aria-hidden subtree was
 * exempt, which is the exact shape of the bug this harness exists to catch.
 * A control an aria-hidden subtree still hands to the tab order is not
 * unoffered, it is offered by one route and named by neither, so it stays in
 * the sweep and hiddenFocusables below fails it by name.
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
      // aria-hidden exempts a control only while it is out of the tab order
      // too. inert is checked rather than trusted from the tag, because inert
      // does not change an element's tabIndex property: an inert button still
      // reports 0 and would otherwise be measured as a live target.
      const offered =
        element instanceof HTMLElement &&
        element.tabIndex >= 0 &&
        !element.closest("[inert]");
      if (element.closest("[aria-hidden='true']") && !offered) continue;
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

/** One control the keyboard still reaches inside a subtree the accessibility
 *  tree no longer has: its accessible-ish name, and the route down to it so a
 *  failure names something findable rather than "a button somewhere". */
export type HiddenFocusable = { name: string; path: string };

/**
 * Every tab stop that lands inside an aria-hidden subtree, shadow roots
 * included.
 *
 * WCAG 4.1.2 in the one shape this site keeps producing: aria-hidden prunes a
 * subtree from the accessibility tree and does nothing to the tab order, so a
 * control inside one is still a stop, and what a screen reader announces when
 * it arrives is nothing at all. The site had six of these hand-maintained
 * before this function existed, each pairing aria-hidden with its own
 * tabIndex={-1}, and the pair is only correct while both halves agree.
 *
 * The walk descends into open shadow roots because the failure that prompted
 * it was not in this document's markup: the about page appends <model-viewer>
 * into a host, and the focusable poster button it keeps is in its shadow
 * root. document.querySelectorAll never sees that button, so a sweep built
 * out of selectors reports the page clean while a real Tab stops on it. That
 * stop is permanent wherever the .glb never arrives.
 *
 * inert is what clears a finding, not tabIndex={-1}, and it is tracked down
 * the walk rather than read off the element: inert is inherited, crosses into
 * a shadow root with the host, and leaves the tabIndex property alone, so an
 * inert button still reports tabIndex 0 and only the ancestor chain knows.
 *
 * Not a tab walk. Pressing Tab through a page answers the same question and
 * costs a round trip per stop, needs a starting point, and stops telling the
 * truth as soon as something traps focus. This reads the two facts a tab stop
 * is made of instead, in one pass in the page.
 */
export async function hiddenFocusables(page: Page): Promise<HiddenFocusable[]> {
  return page.evaluate(() => {
    const found: { name: string; path: string }[] = [];

    const describe = (element: Element) => {
      const slot = element.getAttribute("data-slot");
      const label = element.id ? `#${element.id}` : slot ? `[${slot}]` : "";
      return `${element.tagName.toLowerCase()}${label}`;
    };
    const named = (element: Element) =>
      (element.getAttribute("aria-label") || element.textContent || "")
        .trim()
        .slice(0, 40) || describe(element);

    // A stop, not merely focusable. tabIndex is the browser's own answer and
    // covers every element that earns one from its tag, so nothing here has
    // to keep a list of which tags those are. Everything after it is a reason
    // the browser skips the element anyway.
    const isStop = (element: Element) => {
      if (!(element instanceof HTMLElement || element instanceof SVGElement)) {
        return false;
      }
      if (element.tabIndex < 0) return false;
      if ("disabled" in element && element.disabled === true) return false;
      const style = getComputedStyle(element);
      if (style.visibility === "hidden") return false;
      // display:none and a detached subtree both come back with no boxes,
      // which is the same fact stated in the one place that knows it.
      return element.getClientRects().length > 0;
    };

    const walk = (
      root: ParentNode,
      hidden: boolean,
      inert: boolean,
      path: string,
    ) => {
      for (const element of root.children) {
        // What a modal hid for the life of the modal, marked by the
        // aria-hidden package Radix hides the rest of the page with. Skipped
        // whole, subtree included: the same library's focus scope owns the
        // tab order while that attribute is on, and its own focus guards are
        // aria-hidden tab stops on purpose. This sweep is about the pairs
        // this site writes by hand, and the page behind an open dialog is not
        // one of them. The dialog's own content carries no such marker and
        // stays in the walk, which is the reason to sweep that route at all.
        if (element.hasAttribute("data-aria-hidden")) continue;
        const nowHidden =
          hidden || element.getAttribute("aria-hidden") === "true";
        const nowInert = inert || element.hasAttribute("inert");
        const here = path ? `${path} > ${describe(element)}` : describe(element);
        if (nowHidden && !nowInert && isStop(element)) {
          found.push({ name: named(element), path: here });
        }
        // The host's own state carries into its shadow root: both aria-hidden
        // and inert apply to what is rendered there, and neither is written
        // on the shadow content, which the page does not own.
        if (element.shadowRoot) {
          walk(element.shadowRoot, nowHidden, nowInert, `${here} > #shadow`);
        }
        walk(element, nowHidden, nowInert, here);
      }
    };

    walk(document.body, false, false, "");
    return found;
  });
}
