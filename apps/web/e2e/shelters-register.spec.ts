import { expect, test, type Page } from "@playwright/test";

import { undersizedTargets } from "./reach";

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
//
// A heading tag is not a contract either. The card's name was read here as
// "h3" until the level moved to h2, which it had to: the section prints no
// heading of its own, so the cards were the first level under the page's h1
// and the outline skipped a step. Nothing about this file's subject changed,
// but two measurements stopped finding a card's name. data-card-link is the
// attribute the card already carries for the stretched hit area, and it says
// what is wanted here, which is the link that names the card.

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
        const row = rows.find(
          (candidate) => Math.abs(candidate.top - top) <= 2,
        );
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
          card.querySelector("[data-card-link]")?.textContent?.trim() ?? "?";
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
              .filter((card) =>
                card.querySelector(`a[data-contact="${channel}"]`),
              )
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
      const link = card.querySelector("[data-card-link]");
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
          borderRight: Math.round(parseFloat(style.borderRightWidth) || 0),
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

  // The page's arithmetic, which is the other thing on it that can be wrong
  // without anything looking wrong.
  //
  // The census line and the grid's green pills state the same fact twice: how
  // many shelters share a list with us, and how many animals they hold. They
  // are counted once now, in lib/shelter-census.ts, and that is unit tested;
  // what is checked here is that the two things the page draws off that count
  // are still drawing off it. A census wired to the dataset's own totals and
  // pills wired to the register would agree today and disagree the first time
  // a provider was enabled ahead of its registry entry, which is exactly the
  // sort of change nobody looks at this page after.
  //
  // Read off data-census, data-count and data-animals rather than the text.
  // Slovenian agrees the noun with the number and has a dual, so "186 živali",
  // "2 živali" and "1 žival" are three different shapes; a test parsing them
  // would be testing lib/labels.ts by accident.
  test("prints a census the grid's own pills add up to", async ({ page }) => {
    await page.goto(REGISTER);
    await expect(page.locator(CARD).first()).toBeVisible();

    const counted = await page.evaluate((cardSelector) => {
      const number = (element: Element | null, attribute: string) =>
        element ? Number(element.getAttribute(attribute)) : null;

      const group = (key: string) =>
        number(document.querySelector(`[data-census="${key}"]`), "data-count");

      return {
        shelters: group("shelters"),
        providers: group("providers"),
        animals: group("animals"),
        cards: document.querySelectorAll(cardSelector).length,
        pills: [...document.querySelectorAll("[data-animals]")].map((pill) =>
          Number(pill.getAttribute("data-animals")),
        ),
      };
    }, CARD);

    // The register's own two numbers: a card per shelter counted.
    expect(counted.shelters).toBe(counted.cards);

    // One pill per shelter the census says shares a list, and no pill
    // printing a zero, which is the rule the card is written to.
    expect(counted.pills.length).toBe(counted.providers);
    expect(counted.pills.every((count) => count > 0)).toBe(true);

    // And the total is what those pills add up to.
    const summed = counted.pills.reduce((sum, count) => sum + count, 0);
    expect(summed).toBe(counted.animals);

    // The honest half, the same as `compared` above: every assertion here
    // passes trivially against a page that rendered nothing.
    expect(counted.cards).toBeGreaterThan(0);
    expect(counted.pills.length).toBeGreaterThan(0);
  });

  // What a phone actually does to this page, which is the width most of the
  // traffic reads it at and the one none of the measurements above used.
  // Everything before this line is about a row of cards agreeing with itself,
  // and below sm there is no row: the grid is one column, seventeen cards
  // deep, about seven screens of it.

  // The card had no width defence at all, and nobody could see it.
  //
  // The contact rows carry `truncate`, which was inert: nothing in the chain
  // from the footer slot down to the visible span set min-width 0, so each
  // slot is a grid item whose automatic minimum is its own min-content, and
  // the longest email address in the card set the track's width instead of
  // ellipsising inside it. At 100% text the register's real addresses happen
  // to fit, so the page looked correct and the truncation it was written to
  // rely on had never once run.
  //
  // Raising the text size is what exposes it, and it is also the case that
  // matters: at 200% the page grew to 534px inside a 375px viewport and
  // scrolled sideways, which is a WCAG 1.4.4 failure at AA.
  //
  // 320px because that is the reflow width WCAG names, and the root font size
  // is doubled rather than the viewport halved because that is the failure
  // being guarded: the card's width is set by content that scales with the
  // type, and a test that only narrowed the viewport would keep passing
  // against the bug.
  test("reflows at 200% text without scrolling sideways", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto(REGISTER);
    await expect(page.locator(CARD).first()).toBeVisible();

    const measured = await page.evaluate(async (cardSelector) => {
      const root = document.documentElement;
      const at = async (fontSize: string) => {
        root.style.fontSize = fontSize;
        // Two frames, or the read happens before the relayout it caused.
        await new Promise((done) => requestAnimationFrame(() => done(null)));
        await new Promise((done) => requestAnimationFrame(() => done(null)));
        const cards = [...document.querySelectorAll(cardSelector)];
        return {
          overflow: root.scrollWidth - root.clientWidth,
          // The widest card against the width it was given. A card that wants
          // more than its column is the mechanism; the page overflow above is
          // the symptom, and asserting both says which one broke.
          widestCard: Math.max(
            ...cards.map((card) => card.scrollWidth - card.clientWidth),
          ),
          cards: cards.length,
        };
      };

      const base = await at("16px");
      const doubled = await at("32px");
      root.style.fontSize = "";
      return { base, doubled };
    }, CARD);

    expect(measured.base.cards).toBeGreaterThan(0);

    // A pixel of slack for sub-pixel rounding, and no more.
    expect(measured.base.overflow).toBeLessThanOrEqual(1);
    expect(measured.base.widestCard).toBeLessThanOrEqual(1);
    expect(measured.doubled.overflow).toBeLessThanOrEqual(1);
    expect(measured.doubled.widestCard).toBeLessThanOrEqual(1);
  });

  // Every target on the page big enough for a thumb, hit-tested rather than
  // measured off a box or a class; reach.ts carries why.
  //
  // The contact rows are what this is really guarding. They were 36px tall
  // and 2px apart, stacking a tel:, a mailto: and an external site inside a
  // card that is itself a link, so a miss of a few pixels silently opened a
  // mail composer. They are the page's primary action on a phone.
  test("gives every control a thumb-sized target at 375px", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(REGISTER);
    await expect(page.locator(CARD).first()).toBeVisible();

    const small = await undersizedTargets(page);

    // measured is the honest half, the same as `compared` above, and it earns
    // its place here twice over: undersizedTargets skips controls that are
    // drawn but not yet offered, and a skip rule written slightly too wide
    // would empty the sweep and pass on nothing at all.
    expect(small.measured).toBeGreaterThan(0);
    expect(small.failures).toEqual([]);
  });

  // The outline a screen reader navigates by, which on a page seven screens
  // deep is the only way through it that is not scrolling.
  //
  // The cards were h3 under the page's h1 with no h2 anywhere: the section
  // that holds them carries an accessible label rather than a printed
  // heading, so nothing filled the level. Asserted as "no level is skipped"
  // rather than "the cards are h2", because which level is correct follows
  // from whether the section prints a heading of its own, and that is a
  // design decision this file should not pin.
  test("prints a heading outline with no skipped level", async ({ page }) => {
    await page.goto(REGISTER);
    await expect(page.locator(CARD).first()).toBeVisible();

    const levels = await page.evaluate(() =>
      [...document.querySelectorAll("h1, h2, h3, h4, h5, h6")].map((heading) =>
        Number(heading.tagName.slice(1)),
      ),
    );

    expect(levels.length).toBeGreaterThan(1);
    expect(levels[0]).toBe(1);

    const skips = levels
      .map((level, index) => ({ level, previous: levels[index - 1] ?? level }))
      .filter((step) => step.level > step.previous + 1);
    expect(skips).toEqual([]);
  });

  // A shelter's mark, drawn at its own proportions or not drawn at all.
  //
  // markBox in shelter-avatar.tsx computes an exact pixel box and sets it as
  // an inline width and height. When the row it sits in runs short the width
  // gives way and the height does not, so the mark is squashed rather than
  // scaled: Horjul measured 144x27 against a natural 384x71, and with a wider
  // count pill beside it came out 129x27, a ratio of 4.78 against the file's
  // own 5.41.
  //
  // 320px is where the margin actually is. The caps were calibrated against
  // the two-column band at 640px, which leaves about 256px inside the card
  // padding; the single column at 320px leaves 246px, and the widest pill
  // takes 84 to 92 of it rather than the 80 the calibration assumed. Two of
  // the seventeen marks have six pixels of slack there.
  test("draws every mark at its own proportions at 320px", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto(REGISTER);
    await expect(page.locator(CARD).first()).toBeVisible();

    // The marks are lazy and this page is seven screens deep, so most of them
    // are not fetched at all on arrival: their natural size is zero and the
    // ratio below would divide by it. Asking for them eagerly changes when the
    // page loads them and not how it draws them, which is what is asserted
    // here. Waiting on `complete` rather than decode(), because a lazy image
    // that never enters the viewport never settles its decode promise and the
    // measurement would hang instead of failing.
    await page.evaluate((cardSelector) => {
      for (const image of document.querySelectorAll<HTMLImageElement>(
        `${cardSelector} img`,
      )) {
        image.loading = "eager";
      }
    }, CARD);
    // Settled, not loaded. A 404 sets `complete` and leaves naturalWidth at 0,
    // so requiring a natural size here waits for something that will never
    // arrive: apps/web/public/media is gitignored and written by the ingest
    // run, so a fresh clone serves every mark as a 404 and this hung for the
    // full timeout on a message about waiting rather than about the logos.
    // Waiting only for the fetches to settle lets the count below be the thing
    // that fails, and it says what is missing.
    await page.waitForFunction(
      (cardSelector) =>
        [
          ...document.querySelectorAll<HTMLImageElement>(`${cardSelector} img`),
        ].every((image) => image.complete),
      CARD,
    );

    const marks = await page.evaluate((cardSelector) => {
      const images = [
        ...document.querySelectorAll<HTMLImageElement>(`${cardSelector} img`),
      ];

      // A mark that failed to load is not a mark drawn at the wrong
      // proportions, so it is dropped here rather than counted as a ratio of
      // zero over zero. The count assertion below is what notices that they
      // all went.
      return images
        .filter((image) => image.naturalWidth > 0 && image.naturalHeight > 0)
        .map((image) => {
          const box = image.getBoundingClientRect();
          return {
            src: image.currentSrc.slice(-24),
            drawn: box.width / box.height,
            natural: image.naturalWidth / image.naturalHeight,
          };
        });
    }, CARD);

    // Every card carrying a logo in the manifest, or the media never made it
    // onto disk. See the wait above.
    expect(marks.length).toBeGreaterThan(0);

    // 3%, which is the rounding markBox does on both dimensions and nothing
    // more. A squash shows up an order of magnitude above this.
    const distorted = marks.filter(
      (mark) => Math.abs(mark.drawn / mark.natural - 1) > 0.03,
    );
    expect(distorted).toEqual([]);
  });
});
