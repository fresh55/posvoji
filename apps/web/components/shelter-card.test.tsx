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
      level: 3,
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
    render(<ShelterCard shelter={shelter({ phone: "03 749 06 00" })} text={text} />);

    // Behind a 24px glyph the number lived only in an aria-label, so a desktop
    // reader who had just found a stray could see that a shelter had a phone
    // and never what it was. The spaces come out of the href, or a phone
    // cannot dial it.
    const link = screen.getByRole("link", { name: "Telefon: 03 749 06 00" });
    expect(link.getAttribute("href")).toBe("tel:037490600");
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

  it("falls back to an initial when the shelter has no logo", () => {
    render(
      <ShelterCard
        shelter={shelter({ name: "Veterinarska bolnica Brežice" })}
        text={text}
      />,
    );

    // The manifest is read at build time, so a shelter without a logo never
    // risks a 404: it gets a letter, and that letter is decoration the name
    // beside it already says.
    //
    // The letter is the first distinctive word's, not the name's first
    // character: half the register opens with "Zavetišče" or "Veterina", so
    // the head of the name drew the same plate on card after card. See
    // lib/shelter-initial.ts.
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText("B")).toBeTruthy();
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
      return {
        width: Number.parseFloat(img?.style.width ?? "0"),
        height: Number.parseFloat(img?.style.height ?? "0"),
      };
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

  it("keeps the green off a mark for a shelter that shares no list", () => {
    // Green says one thing on this site, and the count pill beside the mark
    // says it too. An avatar wearing it on a contact-only shelter would be
    // claiming a list we do not have.
    const plate = (over: Partial<ShelterCardData>) => {
      const { container } = render(
        <ShelterCard
          shelter={shelter({ name: "Zavetišče Potepuhi", ...over })}
          text={text}
        />,
      );
      // The letter is the shelter's own initial, cut past the generic first
      // word: "Zavetišče Potepuhi" draws a P. See lib/shelter-initial.ts.
      return within(container).getByText("P").className;
    };

    expect(plate({ animals: 4 })).toContain("--filter-accent");
    expect(plate({})).not.toContain("--filter-accent");
  });

  it("says how many animals a shelter that shares its list holds", () => {
    render(<ShelterCard shelter={shelter({ animals: 2 })} text={text} />);

    // The census line states a total and how many shelters are in it. Which
    // shelters, and with how many animals each, is only ever said here.
    //
    // Two, not five: the dual is the form a naive plural gets wrong.
    expect(screen.getByText("2 živali")).toBeTruthy();
  });

  it("prints nothing where a shelter shares no list", () => {
    render(<ShelterCard shelter={shelter({ animals: 0 })} text={text} />);
    render(<ShelterCard shelter={shelter()} text={text} />);

    // never-print-a-zero, the rule the whole page keeps: "0 živali" reads as a
    // shelter with no animals in it rather than as a shelter whose list we do
    // not publish.
    expect(screen.queryByText(/žival/)).toBeNull();
  });

  it("carries an anchor a link can name", () => {
    render(<ShelterCard shelter={shelter()} text={text} />);

    expect(document.getElementById("zavetisce-zonzani")).toBeTruthy();
  });
});
