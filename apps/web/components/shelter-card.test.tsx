// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { animalCount } from "@/lib/labels";
import { ShelterCard, type ShelterCardData } from "./shelter-card";

afterEach(cleanup);

const text = {
  website: "Spletna stran",
  email: "E-pošta",
  phone: "Telefon",
  newWindow: "(odpre se v novem oknu)",
  // The page's own formatter, so the test reads the string a reader gets,
  // Slovenian agreement and all.
  animals: (count: number) => animalCount(count, "sl"),
  noAnimals: "Živali niso objavljene",
};

function shelter(over: Partial<ShelterCardData> = {}): ShelterCardData {
  return {
    id: "zonzani",
    name: "Zavetišče Zonzani",
    city: "Dramlje",
    href: "/zavetisca/zonzani",
    ...over,
  };
}

// A mark, for the cases that turn on whether the card has one. A wordmark's
// proportions, because that is what most of the register's logos are.
const LOGO = {
  url: "/media/shelter-logos/abc.webp",
  chipOnLight: false,
  chipOnDark: true,
  opaque: false,
  width: 300,
  height: 100,
};

describe("the shelter card", () => {
  it("names the link with the shelter and nothing else on the card", () => {
    render(<ShelterCard shelter={shelter()} text={text} />);

    // The whole card is clickable through a stretched overlay, but the
    // accessible name has to stay the shelter, not every word printed here.
    const link = screen.getByRole("link", { name: "Zavetišče Zonzani" });
    expect(link.getAttribute("href")).toBe("/zavetisca/zonzani");
  });

  it("keeps the name as the heading and the town as plain text", () => {
    render(<ShelterCard shelter={shelter()} text={text} />);

    const name = screen.getByRole("heading", {
      level: 2,
      name: "Zavetišče Zonzani",
    });
    expect(within(name).getByRole("link")).toBeTruthy();
    // The town must not become a second link to the page the name already
    // goes to.
    expect(screen.getByText("Dramlje").closest("a")).toBeNull();
  });

  it("offers only the contact channels the registry holds", () => {
    render(
      <ShelterCard
        shelter={shelter({ email: "info@zonzani.si", phone: "03 749 06 00" })}
        text={text}
      />,
    );

    // The accessible name names the channel and then repeats what is printed,
    // which is what WCAG 2.5.3 asks of a control whose label is visible.
    expect(
      screen
        .getByRole("link", { name: "E-pošta: info@zonzani.si" })
        .getAttribute("href"),
    ).toBe("mailto:info@zonzani.si");
    expect(screen.queryByRole("link", { name: /Spletna stran/ })).toBeNull();
  });

  it("names each contact row's channel for the e2e suite", () => {
    render(
      <ShelterCard
        shelter={shelter({
          phone: "03 749 06 00",
          email: "info@zonzani.si",
          website: "https://www.zonzani.si/",
        })}
        text={text}
      />,
    );

    // data-contact is a test contract: the alignment spec asks for one card's
    // phone row and its neighbour's, and the e2e suite selects on roles and
    // data attributes rather than on classes. Nothing in the app reads these,
    // so this is what says they are not dead.
    expect(
      [...document.querySelectorAll("[data-contact]")].map((row) =>
        row.getAttribute("data-contact"),
      ),
    ).toEqual(["phone", "email", "website"]);
  });

  it("prints the number rather than hiding it behind an icon", () => {
    render(
      <ShelterCard shelter={shelter({ phone: "03 749 06 00" })} text={text} />,
    );

    // Behind a 24px glyph the number lived only in an aria-label, so a desktop
    // reader who had just found a stray could see that a shelter had a phone
    // and never what it was. The href is E.164 while the label stays the way
    // the register writes it: a national number dials only on a handset whose
    // own region is Slovenia, and the visitor most likely to be holding a
    // stray here is on a foreign SIM. See lib/contact-links.ts.
    const link = screen.getByRole("link", { name: "Telefon: 03 749 06 00" });
    expect(link.getAttribute("href")).toBe("tel:+38637490600");
    expect(within(link).getByText("03 749 06 00")).toBeTruthy();
  });

  it("says that the website leaves the site", () => {
    render(
      <ShelterCard
        shelter={shelter({ website: "https://www.zonzani.si/" })}
        text={text}
      />,
    );

    const link = screen.getByRole("link", {
      name: "Spletna stran: zonzani.si (odpre se v novem oknu)",
    });
    expect(link.getAttribute("target")).toBe("_blank");
    // The scheme and the www come off what is printed, not off the href.
    expect(link.getAttribute("href")).toBe("https://www.zonzani.si/");
    expect(within(link).getByText("zonzani.si")).toBeTruthy();
  });

  it("draws no mark when the shelter has no logo", () => {
    render(
      <ShelterCard
        shelter={shelter({ name: "Veterinarska bolnica Brežice" })}
        text={text}
      />,
    );

    // The manifest is read at build time, so a shelter without a logo never
    // risks a 404. It used to get a letter in a disc instead, which beside
    // the real marks read as a placeholder; the left of the row is empty now
    // and the no-list line on the right holds it.
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.queryByText("B")).toBeNull();
    expect(screen.getByText(text.noAnimals)).toBeTruthy();
  });

  it("draws the logo when the manifest has one", () => {
    render(
      <ShelterCard
        shelter={shelter({
          logo: {
            url: "/media/shelter-logos/abc.webp",
            chipOnLight: false,
            chipOnDark: true,
            opaque: false,
            width: 300,
            height: 100,
          },
        })}
        text={text}
      />,
    );

    // alt is empty on purpose: the name is printed right beside it, and a
    // second reading of it is noise.
    const logo = document.querySelector("img");
    expect(logo?.getAttribute("alt")).toBe("");
  });

  it("draws a portrait mark tall and a wordmark wide rather than both at one height", () => {
    // The register is the one page that draws every shelter's mark side by
    // side, so it is the one page where a fixed height is read as a size. The
    // set runs from 0.82:1 to about 4:1, and at a fixed height the portrait
    // mark came out a fifth of the wordmark's size. See WIDTH_FALLOFF.
    const box = (logo: { width: number; height: number }) => {
      const { container } = render(
        <ShelterCard
          shelter={shelter({
            logo: {
              url: "/media/shelter-logos/a.webp",
              chipOnLight: false,
              chipOnDark: true,
              opaque: false,
              ...logo,
            },
          })}
          text={text}
        />,
      );
      const img = container.querySelector("img");
      // The height is not written as a style any more. It is tied to the
      // width through aspect-ratio, so that a row which runs short takes the
      // whole box down together instead of shrinking the width against a
      // height pinned in pixels, which drew the mark flatter than it is. The
      // ratio markBox emits is its own two numbers, so this recovers exactly
      // the height it computed. See shelter-avatar.tsx.
      const width = Number.parseFloat(img?.style.width ?? "0");
      // The ratio's own two numbers are markBox's, and its first is the width
      // already read above, so the second is the height with no arithmetic in
      // between. Written out, the multiply and divide read as a conversion
      // that could produce something else.
      const [, height] = (img?.style.aspectRatio ?? "0/0")
        .split("/")
        .map((part) => Number.parseFloat(part));
      return { width, height };
    };

    const portrait = box({ width: 105, height: 128 });
    const wordmark = box({ width: 128, height: 27 });

    expect(portrait.height).toBeGreaterThan(wordmark.height);
    expect(portrait.width).toBeLessThan(wordmark.width);
    // Neither is crushed the way the old fixed 28px cap crushed the portrait
    // one, and neither runs away with the row: the wider mark buys its width
    // with height, so the two areas stay within about twice each other.
    expect(portrait.height).toBeGreaterThan(40);
    expect(wordmark.height).toBeGreaterThan(24);
    const area = (b: { width: number; height: number }) => b.width * b.height;
    expect(area(wordmark) / area(portrait)).toBeLessThan(2);
  });

  it("draws no mark for a shelter without a logo, whatever it shares", () => {
    // Green says one thing on this site, and the count pill is where the
    // card says it. The mark used to be a lettered disc for a shelter with
    // no logo, and it wore the same green on a provider; with no disc drawn
    // at all, the pill carries the statement alone.
    const { container } = render(
      <ShelterCard
        shelter={shelter({ name: "Zavetišče Potepuhi", animals: 4 })}
        text={text}
      />,
    );

    expect(within(container).queryByText("P")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(within(container).getByText("4 živali").className).toContain(
      "bg-brand",
    );
  });

  it("says how many animals a shelter that shares its list holds", () => {
    render(<ShelterCard shelter={shelter({ animals: 2 })} text={text} />);

    // The census line states a total and how many shelters are in it. Which
    // shelters, and with how many animals each, is only ever said here.
    //
    // Two, not five: the dual is the form a naive plural gets wrong.
    expect(screen.getByText("2 živali").getAttribute("data-animals")).toBe(
      "2",
    );
  });

  it("says why, rather than a zero, where a shelter shares no list", () => {
    render(<ShelterCard shelter={shelter({ animals: 0 })} text={text} />);
    render(<ShelterCard shelter={shelter()} text={text} />);

    // never-print-a-zero, the rule the whole page keeps: "0 živali" reads as a
    // shelter with no animals in it rather than as a shelter whose list we do
    // not publish. Absent and zero are the same answer and both take the line.
    expect(screen.queryByText(/\d+\s+živali/)).toBeNull();
    const reasons = screen.getAllByText("Živali niso objavljene");
    expect(reasons).toHaveLength(2);
    expect(
      // Marked, but never as a data-animals value: the browser suite adds
      // those up against the census line.
      reasons.every(
        (reason) =>
          reason.hasAttribute("data-no-list") &&
          !reason.hasAttribute("data-animals"),
      ),
    ).toBe(true);
  });

  it("keeps the count and the reason out of each other's way", () => {
    render(<ShelterCard shelter={shelter({ animals: 2 })} text={text} />);

    // A card states one or the other, never both: the slot they share is what
    // makes the column of counts readable down the grid.
    expect(screen.queryByText("Živali niso objavljene")).toBeNull();
  });

  it("puts the name above the mark on a phone and leaves the band alone", () => {
    const { container } = render(
      <ShelterCard
        shelter={shelter({ animals: 2, logo: LOGO })}
        text={text}
      />,
    );

    // Below sm the grid is one column, so the card has no row to align its
    // sections against and lays them out as a flex column instead: the name
    // and the town first, the mark and the count under them, the contacts
    // last. Everything here is max-sm, so the subgrid band from sm up is
    // untouched, which is what these assertions are really guarding.
    const card = container.querySelector("li");
    expect(card?.className).toContain("max-sm:flex");
    expect(card?.className).toContain("max-sm:flex-col");
    // One order utility does it: the content goes to the front and the other
    // two keep their source order behind it. So the assertion is that the
    // content is pulled and that nothing else carries an order at all, which
    // is what would quietly reintroduce a second ordering to keep in step.
    const order = (slot: string) =>
      container.querySelector(`[data-slot="${slot}"]`)?.className ?? "";
    expect(order("item-content")).toContain("max-sm:order-first");
    expect(order("item-media")).not.toContain("order-");
    expect(order("item-footer")).not.toContain("order-");
  });

  it("folds the count onto the town's line on a phone with no mark", () => {
    const { container } = render(
      <ShelterCard shelter={shelter({ animals: 2 })} text={text} />,
    );

    // With no mark the media row is one short phrase, and under the town it
    // took a line of the card to say it. Below sm the card wraps instead: the
    // row is pushed to the right edge and set against the bottom of the name
    // block, which is the town's line, and the contacts take a full basis so
    // they keep a line under both. Everything asserted here is max-sm, so the
    // subgrid band from sm up is the same on every card, mark or no mark.
    const card = container.querySelector("li");
    expect(card?.className).toContain("max-sm:flex-wrap");
    expect(card?.className).not.toContain("max-sm:flex-col");

    const media = container.querySelector('[data-slot="item-media"]');
    expect(media?.className).toContain("max-sm:ml-auto");
    expect(media?.className).toContain("max-sm:self-end");
    expect(
      container.querySelector('[data-slot="item-footer"]')?.className,
    ).toContain("max-sm:basis-full");
  });

  it("states the count once per card, whichever phone layout it gets", () => {
    const card = (over: Partial<ShelterCardData>) =>
      render(<ShelterCard shelter={shelter(over)} text={text} />).container;

    // The browser suite adds data-animals up against the census line and
    // counts the cards that carry data-no-list, so a card that drew either of
    // them twice, one copy hidden behind a breakpoint, would be a card
    // counted twice. That is why the fold is CSS over one element rather than
    // a second element for the phone.
    expect(card({ animals: 2 }).querySelectorAll("[data-animals]")).toHaveLength(
      1,
    );
    expect(
      card({ animals: 2, logo: LOGO }).querySelectorAll("[data-animals]"),
    ).toHaveLength(1);
    expect(card({}).querySelectorAll("[data-no-list]")).toHaveLength(1);
    expect(card({ logo: LOGO }).querySelectorAll("[data-no-list]")).toHaveLength(
      1,
    );
  });

  it("draws the phone card tighter and its name larger", () => {
    const { container } = render(
      <ShelterCard shelter={shelter()} text={text} />,
    );

    // 16px of padding and 12px between the sections instead of Item's 20 and
    // 16, and the name at 18px instead of 16. The class list is the contract
    // here because the size is the point: cn merges these after Item's own
    // p-5 and gap-4, so a later padding on the primitive cannot quietly win.
    const card = container.querySelector("li");
    expect(card?.className).toContain("max-sm:p-4");
    expect(card?.className).toContain("max-sm:gap-3");

    const title = container.querySelector('[data-slot="item-title"]');
    expect(title?.className).toContain("max-sm:text-lg");
    // text-pretty over ItemTitle's own text-balance: balance is capped at
    // about six lines and the long names take four or five short ragged ones
    // at 320.
    expect(title?.className).toContain("text-pretty");
    expect(title?.className).not.toContain("text-balance");
  });

  it("sizes the contact rows for the pointer rather than the viewport", () => {
    const { container } = render(
      <ShelterCard
        shelter={shelter({ phone: "03 749 06 00", email: "info@zonzani.si" })}
        text={text}
      />,
    );

    // 44px and no gap for a thumb, 36px and 2px for a mouse. Asked of the
    // pointer, not of a width: max-lg gave the touch row to a 1024px laptop
    // window and took it from the 1180px tablet. The rows tile on touch
    // because the band between two of them falls through to the name's
    // stretched ::after, which walks to the shelter's page.
    const row = container.querySelector("[data-contact]");
    expect(row?.className).toContain("pointer-coarse:min-h-11");
    expect(row?.className).not.toContain("max-lg:min-h-11");
    expect(
      container.querySelector('[data-slot="item-footer"]')?.className,
    ).toContain("pointer-coarse:gap-0");
  });

  it("carries an anchor a link can name", () => {
    render(<ShelterCard shelter={shelter()} text={text} />);

    expect(document.getElementById("zavetisce-zonzani")).toBeTruthy();
  });
});
