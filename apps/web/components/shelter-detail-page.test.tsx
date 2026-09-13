// @vitest-environment jsdom
//
// jsdom, not node: I18nProvider wraps every page in MotionConfig
// (motion/react), which reads window.matchMedia when it resolves the
// reducedMotion="user" setting.

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ShelterDetailPage } from "./shelter-detail-page";
import { getMessages } from "@/lib/i18n";
import { CONTENT_ID } from "@/lib/skip-link";

// The catalogue itself, not a copy of its strings: these are the words two
// surfaces share, so a copy edit in i18n.ts should move this test with it
// rather than fail it.
const messages = getMessages("sl");

Object.defineProperty(window, "matchMedia", {
  configurable: true,
  value: vi.fn().mockImplementation((media: string) => ({
    matches: false,
    media,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })),
});

// A shelter whose town is the widest the register holds, because the town is
// half of what the line under the name has to fit. It carries all three
// contacts, which is what the register holds for most entries.
const SHELTER = {
  id: "test-shelter",
  name: "Zavetišče Mala hiša",
  city: "Moravske Toplice",
  website: "https://www.zavetisce-malahisa.si/",
  email: "info@zavetisce-malahisa.si",
  phone: "031 732 700",
};

// The other end of the register: an entry with no animals on the site and no
// contact of any kind. Six shelters publish no list today; none is without a
// phone, so the contact-less half is the guard being documented rather than a
// state the register can currently reach.
const BARE = {
  id: "bare-shelter",
  name: "Zavetišče brez objav",
  city: "Celje",
};

const { ANIMALS } = vi.hoisted(() => ({
  ANIMALS: [1, 2, 3].map((n) => ({
    id: `test-shelter:${n}`,
    source: {
      providerId: "test-shelter",
      sourceAnimalId: String(n),
      sourceUrl: "https://example.test/animals/1",
      fetchedAt: "2026-01-01T00:00:00.000Z",
      firstSeenAt: "2026-01-01T00:00:00.000Z",
      lastSeenAt: "2026-01-01T00:00:00.000Z",
    },
    shelter: {
      id: "test-shelter",
      name: "Zavetišče Mala hiša",
      city: "Moravske Toplice",
    },
    name: `Muri ${n}`,
    // Long enough ago to have earned the long-stay mark, which is what makes
    // the test below about the order rather than about the animals.
    intakeDate: "2019-01-01",
    species: "cat" as const,
    status: "available" as const,
    medical: {},
    images: [],
    attribution: "Test fixture",
  })),
}));

// The register, the dataset and the logo manifest are all read off disk in
// production. Mocked so the hero under test is this shelter and these three
// animals rather than whatever data/dist happens to hold. animalsForClient
// stays the real one: the grid below the hero is handed its output.
vi.mock("@/lib/shelters", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/shelters")>()),
  getShelterBySlug: (slug: string) =>
    [SHELTER, BARE].find((shelter) => shelter.id === slug),
  shelterRegisterDate: () => "2026-01-01",
}));
// shelterAnimals is mocked beside loadDataset rather than left to derive
// itself from it: it calls loadDataset within its own module, where this mock
// does not reach.
vi.mock("@/lib/dataset", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/dataset")>()),
  loadDataset: () => ({
    animals: ANIMALS,
    generatedAt: "2026-01-01T00:00:00.000Z",
  }),
  shelterAnimals: (shelterId: string) =>
    ANIMALS.filter((animal) => animal.shelter.id === shelterId),
}));
vi.mock("@/lib/shelter-logos", () => ({
  getShelterLogos: () => ({}),
}));

afterEach(cleanup);

function hero(container: HTMLElement) {
  const heading = container.querySelector("h1");
  if (!heading) throw new Error("hero heading not found");
  const column = heading.parentElement;
  const line = column?.querySelector("p");
  if (!column || !line) throw new Error("hero town line not found");
  return { heading, column, line };
}

// The register card announces its contacts this way already
// (shelter-card.tsx), and a reader who scanned the card and then opened the
// page meets the same three in the same order, named the same way.
describe("the shelter page's contacts", () => {
  it("puts the channel in front of each value and the site last", () => {
    const { container } = render(
      <ShelterDetailPage locale="sl" slug={SHELTER.id} />,
    );

    const contacts = [...container.querySelectorAll("a[data-contact]")];
    expect(contacts.map((a) => a.getAttribute("data-contact"))).toEqual([
      "phone",
      "email",
      "website",
    ]);
    // The visible label is the value, so the accessible name adds the channel
    // in front of it rather than replacing it (WCAG 2.5.3).
    expect(contacts[0].getAttribute("aria-label")).toBe(
      `${messages.contactPhone}: ${SHELTER.phone}`,
    );
    expect(contacts[0].getAttribute("href")).toBe("tel:+38631732700");
    expect(contacts[1].getAttribute("aria-label")).toBe(
      `${messages.contactEmail}: ${SHELTER.email}`,
    );
  });

  it("says the site opens in a new window, to everyone", () => {
    const { container } = render(
      <ShelterDetailPage locale="sl" slug={SHELTER.id} />,
    );

    const site = container.querySelector('a[data-contact="website"]');
    if (!site) throw new Error("website contact not found");
    // target="_blank" announces nothing on its own, and the host is the part
    // of the URL worth hearing.
    expect(site.getAttribute("aria-label")).toBe(
      `${messages.contactWebsite}: zavetisce-malahisa.si ${messages.newWindow}`,
    );
    // And a mark a thumb can see, because a title is a hover a touch never
    // performs.
    expect(site.querySelector("[data-external]")).not.toBeNull();
  });

  it("draws no contact row for a shelter that has none", () => {
    const { container } = render(
      <ShelterDetailPage locale="sl" slug={BARE.id} />,
    );

    // Not merely empty: an empty flex row still takes a gap out of the stack
    // above it, which prints as a hole under the name.
    expect(container.querySelectorAll("a[data-contact]")).toHaveLength(0);
    expect(container.querySelector("h1")?.textContent).toBe(BARE.name);
  });
});

// Only once there is a point to explain, and only in one place. A boxed
// notice in the hero used to say what the footer of this same page says.
describe("what the shelter page explains", () => {
  it("cites the register, and leaves the listings sentence to the footer", () => {
    const { container } = render(
      <ShelterDetailPage locale="sl" slug={SHELTER.id} />,
    );

    const provenance = container.querySelector("main > p:last-of-type");
    expect(provenance?.textContent).toContain("Vir: UVHVVR");
    // messages.footer, one border below, already states that every animal
    // carries its source and a link to the original listing. The page does
    // not say it a second time above the cards.
    expect(provenance?.textContent).not.toContain("izvorno objavo");
    expect(container.querySelector("footer")?.textContent).toContain(
      "povezava na izvorno objavo",
    );
    // And nothing explaining an absence, on a page whose list is there.
    expect(container.textContent).not.toContain("trenutno ni objav");
  });

  it("explains an empty page, where a reader cannot tell why", () => {
    const { container } = render(
      <ShelterDetailPage locale="sl" slug={BARE.id} />,
    );

    expect(container.textContent).toContain(
      "Za to zavetišče na Posvoji.si trenutno ni objav živali.",
    );
    // The town and nothing else: a count here would read as a shelter
    // holding no animals rather than as one we publish nothing for.
    expect(hero(container).line.textContent).toBe(BARE.city);
  });
});

// jsdom lays nothing out, so none of this can measure the overflow it is
// about. What it can hold is the mechanism: the classes that decide whether
// the line wraps or runs off the side of a 320px screen.
describe("the shelter page's hero", () => {
  it("wraps the town and count line rather than running it off the page", () => {
    const { container } = render(
      <ShelterDetailPage locale="sl" slug={SHELTER.id} />,
    );

    // Without flex-wrap the line's minimum width is the sum of its parts, and
    // beside a 170px logo at a 320px viewport that was 18px more than the
    // column had: the document scrolled sideways and the count was cut off.
    const { line } = hero(container);
    expect(line.className).toContain("flex-wrap");
    // Both facts are still printed. Wrapping, not truncation.
    expect(line.textContent).toContain("Moravske Toplice");
    expect(line.textContent).toContain("3 živali");
  });

  it("keeps the pin with the town and the middot with the count", () => {
    const { container } = render(
      <ShelterDetailPage locale="sl" slug={SHELTER.id} />,
    );

    // Each fact is one flex item, so a break falls between them rather than
    // leaving the pin or the separator alone at the end of a line.
    const { line } = hero(container);
    const groups = [...line.children].filter(
      (child) => child.tagName === "SPAN",
    );
    expect(groups).toHaveLength(2);
    expect(groups[0].querySelector("svg")).toBeTruthy();
    expect(groups[0].textContent).toBe("Moravske Toplice");
    expect(groups[1].textContent).toBe("·3 živali");
  });

  it("gives the name and town column a floor to wrap under the mark", () => {
    const { container } = render(
      <ShelterDetailPage locale="sl" slug={SHELTER.id} />,
    );

    // A shelter's mark draws up to 170px wide, which left this column about
    // 100px at 320px. min-w-0 let it be crushed to that; a floor makes the
    // row's flex-wrap move the column under the mark instead, where it has
    // the full width.
    const { column, heading } = hero(container);
    expect(column.className).toContain("min-w-[min(10rem,100%)]");
    expect(column.className).not.toContain("min-w-0");
    expect(column.parentElement?.className).toContain("flex-wrap");
    // And under the floor, a word wider than the column breaks rather than
    // the page.
    expect(heading.className).toContain("break-words");
  });

  it("wraps the same line on the English page", () => {
    const { container } = render(
      <ShelterDetailPage locale="en" slug={SHELTER.id} />,
    );

    // "3 animals" is wider than "3 živali", so the English hero was the worse
    // of the two overflows.
    const { line } = hero(container);
    expect(line.className).toContain("flex-wrap");
    expect(line.textContent).toContain("3 animals");
  });
});

// The largest shelter in the register holds 186 animals. The grid draws them
// in steps now (shelter-animal-grid.test.tsx), but even the sixty it starts
// with stand between the reader and the footer, which is the only way to any
// other page at phone width.
describe("the shelter page's ways past its animals", () => {
  it("bypasses the grid to a landing pad that takes focus", () => {
    const { container } = render(
      <ShelterDetailPage locale="sl" slug={SHELTER.id} />,
    );

    const skip = container.querySelector('a[href="#za-zivalmi"]');
    const pad = container.querySelector("#za-zivalmi");
    if (!skip || !pad) throw new Error("bypass link or landing pad not found");

    expect(skip.textContent).toBe("Preskoči živali tega zavetišča");
    // tabIndex, or the anchor only scrolls the page and leaves the keyboard
    // back at the first card.
    expect(pad.getAttribute("tabindex")).toBe("-1");
    // After the cards, not before them.
    expect(
      skip.compareDocumentPosition(pad) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  // The grid here sorts by the wait (DEFAULT_ANIMAL_SORT in
  // shelter-animal-grid.tsx), so a mark on each card would be the order
  // repeating itself, exactly as on the home grid under its default sort. The
  // card applies that rule; this is the wiring that tells it which order it is
  // in, and it was missed the first time the rule was written.
  it("leaves the long-stay mark off a list already ordered by the wait", () => {
    const { container } = render(
      <ShelterDetailPage locale="sl" slug={SHELTER.id} />,
    );

    expect(container.querySelectorAll("article").length).toBe(ANIMALS.length);
    expect(container.textContent).not.toContain("Čaka");
  });

  it("mounts back-to-top over a footer that reserves the strip it parks in", () => {
    const { container } = render(
      <ShelterDetailPage locale="sl" slug={SHELTER.id} />,
    );

    expect(container.querySelector('[data-slot="back-to-top"]')).not.toBeNull();
    // Below lg the button stays pinned to the viewport, so the footer has to
    // hold the strip open or the button lands on the footer's links. Asserted
    // on the token the two share rather than on the prop's name, which is what
    // makes them one distance.
    expect(container.querySelector("footer")?.className).toContain(
      "--back-to-top-bottom",
    );
  });

  // The bypass link and the landmark it aims at are one contract, and it is
  // site-shell.tsx that holds both halves now; site-shell.test.tsx is where
  // the two are checked against each other, once, for all nine pages. What is
  // left here is the page's own half of it: that this page draws its chrome
  // through the shell rather than writing its own, which is the only way it
  // can still lose the pair.
  it("draws its chrome through the shell", () => {
    const { container } = render(
      <ShelterDetailPage locale="sl" slug={SHELTER.id} />,
    );

    expect(
      container.querySelector(`header a[href="#${CONTENT_ID}"]`),
    ).not.toBeNull();
    expect(container.querySelector("main")?.id).toBe(CONTENT_ID);
  });
});
