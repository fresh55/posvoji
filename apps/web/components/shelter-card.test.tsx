// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ShelterCard, type ShelterCardData } from "./shelter-card";

afterEach(cleanup);

const text = {
  website: "Spletna stran",
  email: "E-pošta",
  phone: "Telefon",
  newWindow: "(odpre se v novem oknu)",
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
            tone: "dark",
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

  it("carries an anchor a link can name", () => {
    render(<ShelterCard shelter={shelter()} text={text} />);

    expect(document.getElementById("zavetisce-zonzani")).toBeTruthy();
  });
});
