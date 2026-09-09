// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SheltersPage } from "./shelters-page";

const fixtures = vi.hoisted(() => ({
  shelters: [
    { id: "first", name: "Prvo zavetišče", city: "Celje" },
    { id: "second", name: "Drugo zavetišče", city: "Koper" },
    { id: "third", name: "Tretje zavetišče", city: "Maribor" },
  ],
  loadDataset: vi.fn(),
}));

vi.mock("@/lib/shelters", () => ({
  loadShelters: () => fixtures.shelters,
  shelterRegisterDate: () => "2026-02-23",
}));
vi.mock("@/lib/dataset", () => ({ loadDataset: fixtures.loadDataset }));
vi.mock("@/lib/shelter-logos", () => ({ getShelterLogos: () => ({}) }));

Object.defineProperty(window, "matchMedia", {
  configurable: true,
  value: vi.fn().mockImplementation((media: string) => ({
    matches: false,
    media,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })),
});

beforeEach(() => {
  fixtures.loadDataset.mockReturnValue({
    animals: ["first", "first", "second"].map(id => ({ shelter: { id } })),
  });
});
afterEach(cleanup);

describe("shelter directory context", () => {
  it.each([
    { locale: "sl" as const, label: "Pregled zavetišč", counts: [
      "3 zavetišča v registru", "2 zavetišči z objavami", "3 živali na Posvoji.si",
    ], lookup: "Najdena žival? Poišči pomoč po občini", href: "/najdena-zival" },
    { locale: "en" as const, label: "Shelter overview", counts: [
      "3 shelters in the registry", "2 shelters with listings", "3 animals on Posvoji.si",
    ], lookup: "Found an animal? Find help by municipality", href: "/en/found-animal" },
  ])("names what every count means in $locale", ({ locale, label, counts, lookup, href }) => {
    render(<SheltersPage locale={locale} />);
    const census = screen.getByRole("list", { name: label });
    expect(within(census).getAllByRole("listitem").map(item => item.textContent)).toEqual(counts);
    expect(screen.getByRole("link", { name: lookup }).getAttribute("href")).toBe(href);
  });

  it.each([null, { animals: [] }])("keeps the directory when no animal listings are available: %s", dataset => {
    fixtures.loadDataset.mockReturnValue(dataset);
    render(<SheltersPage locale="sl" />);
    const census = screen.getByRole("list", { name: "Pregled zavetišč" });
    expect(within(census).getAllByRole("listitem").map(item => item.textContent)).toEqual([
      "3 zavetišča v registru",
    ]);
    expect(screen.getAllByText("Brez objav")).toHaveLength(3);
    expect(screen.getByRole("link", { name: "Prvo zavetišče" })).toBeTruthy();
  });
});

// The strip itself is tested in shelter-jump-strip.test.tsx. What the page
// owes it is the wiring: the label reaches it, and it indexes this page's
// register rather than some other list.
describe("the phone jump strip", () => {
  it("gives the register one chip per card", () => {
    render(<SheltersPage locale="sl" />);
    const strip = screen.getByRole("list", { name: "Skok na zavetišče" });
    const links = within(strip).getAllByRole("link");
    expect(links.map(link => link.getAttribute("href"))).toEqual([
      "#zavetisce-first",
      "#zavetisce-second",
      "#zavetisce-third",
    ]);
    // Every chip resolves to a card that is really on the page, and to its
    // own: two towns in the real register hold two shelters each, so the town
    // alone does not identify a chip and the href is the only thing that can.
    const targets = links.map(link =>
      document.getElementById(link.getAttribute("href")!.slice(1)),
    );
    expect(targets.every(card => card !== null)).toBe(true);
    expect(new Set(targets).size).toBe(links.length);
  });
});
