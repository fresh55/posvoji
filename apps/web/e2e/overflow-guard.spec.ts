import { expect, test, type Page } from "@playwright/test";

// The bug class the missing-base-grid-cols pass fixed (resources-page.tsx,
// portal/animal-editor.tsx): a `md:grid-cols-2` with no `grid-cols-1` base
// left the grid at its implicit column count below md, which is wide enough
// to push the page past the viewport on an actual phone. jsdom reports every
// element as zero-sized, so the unit tests can assert the class changed and
// nothing about whether the page still fits; only a real layout engine can
// answer that. This pins the observable symptom itself -- the document
// running wider than the viewport that is supposed to hold it -- rather than
// the one class that happened to cause it this time, so a different latent
// cause trips the same test.
//
// No isMobile/hasTouch needed here, only the viewport width, so this runs
// under the desktop chromium project rather than joining MOBILE_SPECS in
// playwright.config.ts.
const WIDTHS = [360, 390, 414];

// The site's static top-level routes: both home locales, the shelter index
// that first surfaced this bug, the resources page whose grid caused it, and
// the found-animal page, which is its own layout system (MunicipalityFinder)
// rather than a variant of the filter sidebar.
const ROUTES = ["/", "/en", "/zavetisca", "/viri", "/najdena-zival"];

// The three route kinds the list above cannot reach, one page of each. They
// carry layouts no static route does: the animal page its photo spread and
// fact pills, the shelter page its own grid and contact block, the
// municipality page the answer components the finder renders inline.
//
// Two of the three are found rather than pinned. An animal's address is built
// from its name and a hash of its shelter's id (lib/animal-path.ts), so any
// slug written here stops existing the day that animal is adopted; the index
// page that links to it always names one that exists. The municipality slugs
// come from data/municipalities.yaml, which is the registry of all 212 and
// does not move, so that one is named outright.
const DYNAMIC_ROUTES: { name: string; from: string; link: string }[] = [
  { name: "an animal page", from: "/", link: 'a[href^="/zival/"]' },
  {
    name: "a shelter page",
    from: "/zavetisca",
    link: 'a[href^="/zavetisca/"]',
  },
];

const MUNICIPALITY_ROUTE = "/najdena-zival/ljubljana";

async function expectNoOverflow(page: Page) {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
}

for (const width of WIDTHS) {
  test.describe(`no horizontal overflow at ${width}px`, () => {
    test.use({ viewport: { width, height: 800 } });

    for (const route of [...ROUTES, MUNICIPALITY_ROUTE]) {
      test(route, async ({ page }) => {
        await page.goto(route);
        await expectNoOverflow(page);
      });
    }

    for (const { name, from, link } of DYNAMIC_ROUTES) {
      test(name, async ({ page }) => {
        await page.goto(from);
        const href = await page.locator(link).first().getAttribute("href");
        expect(href, `no ${name} linked from ${from}`).toBeTruthy();
        await page.goto(href!);
        await expectNoOverflow(page);
      });
    }
  });
}
