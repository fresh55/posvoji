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

  it.each([
    { locale: "sl" as const, invitation: "Ste zavetišče in se želite vključiti?", directory: "Zavetišča" },
    { locale: "en" as const, invitation: "Would your shelter like to join?", directory: "Shelters" },
  ])("offers one email invitation after the directory in $locale", ({ locale, invitation, directory }) => {
    render(<SheltersPage locale={locale} />);
    const main = within(screen.getByRole("main"));
    const links = main.getAllByRole("link", { name: "info@posvoji.si" });
    expect(links).toHaveLength(1);
    const link = links[0];
    expect(link.getAttribute("href")).toBe("mailto:info@posvoji.si");
    expect(link.closest("p")?.textContent).toContain(invitation);
    expect(main.getByRole("region", { name: directory }).compareDocumentPosition(link)
      & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it.each([null, { animals: [] }])("keeps the directory when no animal listings are available: %s", dataset => {
    fixtures.loadDataset.mockReturnValue(dataset);
    render(<SheltersPage locale="sl" />);
    const census = screen.getByRole("list", { name: "Pregled zavetišč" });
    expect(within(census).getAllByRole("listitem").map(item => item.textContent)).toEqual([
      "3 zavetišča v registru",
    ]);
    expect(screen.getAllByText("Brez objav na Posvoji.si")).toHaveLength(3);
    expect(screen.getByRole("link", { name: "Prvo zavetišče" })).toBeTruthy();
  });
});
// The phone step the five content pages were missing; resources-page's own
// test says what the ladder is.
describe("the register's heading", () => {
  it("steps down on a phone", () => {
    render(<SheltersPage locale="sl" />);

    expect(
      screen.getByRole("heading", { level: 1 }).className.split(" "),
    ).toEqual(expect.arrayContaining(["text-2xl", "sm:text-3xl", "md:text-4xl"]));
  });
});
