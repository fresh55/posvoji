import { expect, test, type Page } from "@playwright/test";

// The register's geometry, which the unit tests cannot see.
//
// Every layout bug this page has had was invisible to a green suite and was
// found by measuring a real browser: contact rows bottom-aligned so a card
// with one number sat level with its neighbours' emails, an animal-count
// badge in the text stack that pushed eleven cards' contacts a line below the
// six without one, a title wrapping in the two-column band that staggered the
// same rows again, and a census line whose hairlines and padding survived a
// wrap. jsdom has no layout engine, so none of it can be asserted there: it
// reports every box as zero and agrees with whatever it is asked.
//
// What is pinned here is the rule those bugs each broke, rather than the
// mechanism that currently keeps it. How the alignment is achieved is the
// card's business and has changed twice; that it holds is this file's.
//
// The rule is that the contact lists in one grid row begin at the same y, so
// the register reads as columns rather than as seventeen separate boxes.
//
// It is deliberately not "phone across from phone". Three shelters are
// missing a channel (Johanca holds only an email, Muri no phone, Mala hiša no
// email), so their lists are shorter and everything below the gap rides up:
// Johanca's email sits where its neighbours print a phone. Aligning by
// channel instead would need a track per channel and a blank line printed on
// every card missing one, which punches visible holes in those three cards to
// straighten a line nobody is reading across. That is a design decision, not
// a layout invariant, so the weaker and true rule is the one asserted here,
// with the stronger one checked only between cards that carry the same
// channels.
//
// Selectors are data-* attributes and roles, the contract the components
// keep, never class names. See shelter-map.spec.ts for the same rule.

const REGISTER = "/zavetisca";
const CARD = 'li[id^="zavetisce-"]';
const CHANNELS = ["phone", "email", "website"] as const;

type Misalignment = {
  /** 1-based, in visual order down the page. */
  row: number;
  channel: string;
  tops: number[];
  cards: string[];
};

/** What the measurement saw, so a run that compared nothing can say so. */
type Alignment = {
  misaligned: Misalignment[];
  /** How many channel-against-channel comparisons were actually made. */
  compared: number;
};

/**
 * Every place where two cards in one grid row disagree about where a channel
 * sits, and how many comparisons were made to find out.
 *
 * The count is the honest half. An empty list of complaints reads the same
 * whether the rows are level or the selector matched nothing at all, and
 * `data-contact` is an attribute a refactor could drop without any other test
 * noticing, so every caller asserts on both.
 *
 * Rows are grouped by the cards' own top edge rather than by counting columns,
 * so this does not need to know the breakpoint that is in force: whatever the
 * grid drew, cards that start at the same y are a row.
 */
async function alignment(page: Page): Promise<Alignment> {
  return page.evaluate(
    ({ cardSelector, channels }) => {
      const cards = [...document.querySelectorAll(cardSelector)];
      let compared = 0;

      // Sub-pixel grid positions are normal, so a couple of pixels of slack
      // decides membership of a row. The assertions below are exact.
      const rows: { top: number; cards: Element[] }[] = [];
      for (const card of cards) {
        const top = card.getBoundingClientRect().top;
        const row = rows.find((candidate) => Math.abs(candidate.top - top) <= 2);
        if (row) row.cards.push(card);
        else rows.push({ top, cards: [card] });
      }
      rows.sort((a, b) => a.top - b.top);

      const found: Misalignment[] = [];
      rows.forEach((row, index) => {
        // A row of one is the single-column layout, where there is no
        // neighbour to line up with.
        if (row.cards.length < 2) return;

        const named = (card: Element) =>
          card.querySelector("h3")?.textContent?.trim() ?? "?";
        const channelsOf = (card: Element) =>
          [...card.querySelectorAll("a[data-contact]")]
            .map((link) => link.getAttribute("data-contact"))
            .join(",");

        // The rule: every contact list in the row starts at the same y.
        const starts: number[] = [];
        const startNames: string[] = [];
        for (const card of row.cards) {
          const first = card.querySelector("a[data-contact]");
          if (!first) continue;
          starts.push(Math.round(first.getBoundingClientRect().top));
          startNames.push(named(card));
        }
        if (starts.length > 1) {
          compared += 1;
          if (new Set(starts).size > 1) {
            found.push({
              row: index + 1,
              channel: "list start",
              tops: starts,
              cards: startNames,
            });
          }
        }

        // And between cards carrying the same channels, each one lines up.
        // Restricted that way on purpose: see the note at the top of the file
        // on why a card missing a channel is expected to ride up.
        for (const channel of channels) {
          const tops: number[] = [];
          const names: string[] = [];
          for (const card of row.cards) {
            const link = card.querySelector(`a[data-contact="${channel}"]`);
            if (!link) continue;
            tops.push(Math.round(link.getBoundingClientRect().top));
            names.push(named(card));
          }
          if (tops.length < 2) continue;
          const sets = new Set(
            row.cards
              .filter((card) => card.querySelector(`a[data-contact="${channel}"]`))
              .map(channelsOf),
          );
          if (sets.size > 1) continue;
          compared += 1;
          if (new Set(tops).size > 1) {
            found.push({ row: index + 1, channel, tops, cards: names });
          }
        }
      });
      return { misaligned: found, compared };
    },
    { cardSelector: CARD, channels: CHANNELS },
  );
}

test.describe("the shelters register", () => {
  // The three columns, the two columns, and the narrow end of the two-column
  // band, which is where the longest names wrap and where the stagger was
  // worst. Below sm the grid is one column and has nothing to align.
  for (const width of [1440, 1024, 768, 640]) {
    test(`starts every contact list in a row at one y at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(REGISTER);
      await expect(page.locator(CARD).first()).toBeVisible();

      const { misaligned, compared } = await alignment(page);
      expect(misaligned).toEqual([]);
      expect(compared).toBeGreaterThan(0);
    });
  }

  // The rule has to hold for the register the data describes, not only for
  // the seventeen shelters in it today. Both mechanisms this page has used to
  // keep the rows level were sensitive to how many lines a name takes, and
  // the register is edited by adding rows to data/shelters.yaml, where
  // nothing warns that a longer name moves a contact row.
  //
  // So: give one card a name far longer than any real one, at the width where
  // names already wrap, and require the row to survive it.
  test("keeps the rows level when a name is long enough to wrap", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 768, height: 900 });
    await page.goto(REGISTER);

    const first = page.locator(CARD).first();
    await expect(first).toBeVisible();
    const before = await alignment(page);
    expect(before.misaligned).toEqual([]);
    expect(before.compared).toBeGreaterThan(0);

    const grew = await first.evaluate((card) => {
      const link = card.querySelector("h3 a");
      if (!link) return false;
      const height = card.getBoundingClientRect().height;
      link.textContent =
        "Zavetišče za zapuščene živali in nastanitev malih živali Zgornje Poljane pri Slovenj Gradcu";
      // The longer name has to actually take more lines, or this proves
      // nothing about a card whose title wrapped further.
      return card.getBoundingClientRect().height > height;
    });
    expect(grew).toBe(true);

    const after = await alignment(page);
    expect(after.misaligned).toEqual([]);
    expect(after.compared).toBeGreaterThan(0);
  });

  // The census line under the lede: three groups separated by hairlines, which
  // are a separator only while the groups sit on one line. At 375px the third
  // wraps, and the rules that drew the separator and its padding used to
  // follow it, leaving a stroke pointing at the empty end of line one and the
  // wrapped group indented off the column every other line starts from.
  test("keeps the census flush and unruled when it wraps", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(REGISTER);

    const census = page.locator("main p").filter({ hasText: /\d/ }).first();
    await expect(census).toBeVisible();

    const geometry = await census.evaluate((element) => {
      const groups = [...element.children].map((group) => {
        const box = group.getBoundingClientRect();
        const style = getComputedStyle(group);
        return {
          left: Math.round(box.left),
          top: Math.round(box.top),
          borderRight: Math.round(
            parseFloat(style.borderRightWidth) || 0,
          ),
        };
      });
      return {
        groups,
        overflow:
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      };
    });

    expect(geometry.groups.length).toBeGreaterThan(1);

    // No hairline anywhere below sm: with the groups on more than one line
    // there is no arrangement in which every one of them separates a
    // neighbour to its right.
    expect(geometry.groups.map((group) => group.borderRight)).toEqual(
      geometry.groups.map(() => 0),
    );

    // Every group that begins a line begins it at the same x. A wrapped group
    // that kept a left padding meant for a mid-line separator starts further
    // in than the line above it.
    const lines = new Map<number, number[]>();
    for (const group of geometry.groups) {
      lines.set(group.top, [...(lines.get(group.top) ?? []), group.left]);
    }
    const lineStarts = [...lines.values()].map((lefts) => Math.min(...lefts));
    expect(new Set(lineStarts).size).toBe(1);

    // And the page itself does not scroll sideways at a phone's width.
    expect(geometry.overflow).toBeLessThanOrEqual(1);
  });
});
