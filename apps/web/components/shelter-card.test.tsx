// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ShelterCard, type ShelterCardData } from "./shelter-card";

afterEach(cleanup);

const text = {
  provider: "Deli podatke",
  contactOnly: "Le kontaktni podatki",
  website: "Spletna stran",
  email: "E-pošta",
  phone: "Telefon",
};

function shelter(over: Partial<ShelterCardData> = {}): ShelterCardData {
  return {
    id: "zonzani",
    name: "Zavetišče Zonzani",
    city: "Dramlje",
    href: "/zavetisca/zonzani",
    count: 0,
    ...over,
  };
}

describe("the shelter card", () => {
  it("names the link with the shelter and nothing else on the card", () => {
    render(
      <ShelterCard
        shelter={shelter()}
        locale="sl"
        text={text}
        showContactOnly
      />,
    );

    // The whole card is clickable through a stretched overlay, but the
    // accessible name has to stay the shelter, not every word printed here.
    const link = screen.getByRole("link", { name: "Zavetišče Zonzani" });
    expect(link.getAttribute("href")).toBe("/zavetisca/zonzani");
  });

  it("leaves out the contact-only line where no shelter shares a list", () => {
    const { rerender } = render(
      <ShelterCard
        shelter={shelter()}
        locale="sl"
        text={text}
        showContactOnly
      />,
    );
    expect(screen.getByText("Le kontaktni podatki")).toBeTruthy();

    rerender(
      <ShelterCard
        shelter={shelter()}
        locale="sl"
        text={text}
        showContactOnly={false}
      />,
    );
    expect(screen.queryByText("Le kontaktni podatki")).toBeNull();
  });

  it("offers only the contact channels the registry holds", () => {
    render(
      <ShelterCard
        shelter={shelter({ email: "info@zonzani.si", phone: "03 749 06 00" })}
        locale="sl"
        text={text}
        showContactOnly
      />,
    );

    expect(
      screen
        .getByRole("link", { name: "E-pošta: Zavetišče Zonzani" })
        .getAttribute("href"),
    ).toBe("mailto:info@zonzani.si");
    // The spaces come out of the number, or a phone cannot dial it.
    expect(
      screen
        .getByRole("link", { name: "Telefon: Zavetišče Zonzani" })
        .getAttribute("href"),
    ).toBe("tel:037490600");
    expect(
      screen.queryByRole("link", { name: "Spletna stran: Zavetišče Zonzani" }),
    ).toBeNull();
  });

  it("sends the count to the animals grid filtered to this shelter", () => {
    render(
      <ShelterCard
        shelter={shelter({ count: 12, animalsHref: "/?zavetisce=zonzani" })}
        locale="sl"
        text={text}
        showContactOnly
      />,
    );

    const badge = screen.getByRole("link", { name: /Deli podatke/ });
    expect(badge.getAttribute("href")).toBe("/?zavetisce=zonzani");
    expect(badge.textContent).toContain("12 živali");
    expect(screen.queryByText("Le kontaktni podatki")).toBeNull();
  });

  it("keeps the count as plain words when there is nowhere to send it", () => {
    render(
      <ShelterCard
        shelter={shelter({ count: 3 })}
        locale="sl"
        text={text}
        showContactOnly
      />,
    );

    expect(screen.queryByRole("link", { name: /Deli podatke/ })).toBeNull();
    expect(screen.getByText(/Deli podatke/).textContent).toContain("3 živali");
  });
});
