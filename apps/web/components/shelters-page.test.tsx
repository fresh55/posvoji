// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SheltersPage } from "./shelters-page";
import { verificationTime } from "@/lib/source-freshness";

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
  shelterRegisterUrl: () => "https://example.test/shelter-registry.docx",
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
    generatedAt: "2026-10-15T12:00:00.000Z",
    animals: ["first", "first", "second"].map(id => ({ shelter: { id } })),
  });
});
afterEach(cleanup);

describe("shelter directory context", () => {
  it.each([
    { locale: "sl" as const, label: "Pregled zavetišč", counts: [
      "2 zavetišči z objavami", "3 živali na Posvoji.si",
    ], lookup: "Najdena žival? Poišči pomoč po občini", href: "/najdena-zival" },
    { locale: "en" as const, label: "Shelter overview", counts: [
      "2 shelters with listings", "3 animals on Posvoji.si",
    ], lookup: "Found an animal? Find help by municipality", href: "/en/found-animal" },
  ])("names what every count means in $locale", ({ locale, label, counts, lookup, href }) => {
    render(<SheltersPage locale={locale} />);
    const census = screen.getByRole("list", { name: label });
    expect(within(census).getAllByRole("listitem").map(item => item.textContent)).toEqual(counts);
    expect(screen.getByRole("link", { name: lookup }).getAttribute("href")).toBe(href);
    const directory = screen.getByRole("region", { name: locale === "sl" ? "Zavetišča" : "Shelters" });
    // The registry count opens the lead as one sentence, and the two
    // participation counts sit under it, all before the directory.
    const registry = screen.getByText(locale === "sl" ? "3 zavetišča" : "3 shelters");
    expect(registry.closest("p")?.textContent).toBe(locale === "sl"
      ? "3 zavetišča iz registra, kontakti na enem mestu."
      : "3 shelters from the registry, contact details in one place.");
    expect(registry.compareDocumentPosition(census) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(census.compareDocumentPosition(directory) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole("link", { name: locale === "sl" ? "Poglej 2 živali" : "View 2 animals" }).getAttribute("href"))
      .toBe(`${locale === "sl" ? "/" : "/en"}?zavetisce=first`);
  });

  it.each([
    { locale: "sl" as const, invitation: "Ste zavetišče in se želite vključiti ali je podatek napačen?", directory: "Zavetišča" },
    { locale: "en" as const, invitation: "Would your shelter like to join, or is a detail incorrect?", directory: "Shelters" },
  ])("offers one contact for joining and corrections across the whole page in $locale", ({ locale, invitation, directory }) => {
    render(<SheltersPage locale={locale} />);
    const main = within(screen.getByRole("main"));
    const links = screen.getAllByRole("link", { name: "info@posvoji.si" });
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
    expect(screen.queryByRole("list", { name: "Pregled zavetišč" })).toBeNull();
    expect(screen.getByText("3 zavetišča").closest("p")?.textContent)
      .toBe("3 zavetišča iz registra, kontakti na enem mestu.");
    expect(screen.getAllByText("Brez objav na Posvoji.si")).toHaveLength(3);
    expect(screen.getByRole("link", { name: "Prvo zavetišče" })).toBeTruthy();
  });

  it.each([
    { locale: "sl" as const, edition: "izdaja 23. 2. 2026", supplement: "dopolnjeno s spletnimi stranmi zavetišč" },
    { locale: "en" as const, edition: "edition 23 February 2026", supplement: "supplemented with shelters’ websites" },
  ])("distinguishes the linked registry edition from animal publication in $locale", ({ locale, edition, supplement }) => {
    const { container } = render(<SheltersPage locale={locale} />);
    const main = screen.getByRole("main");
    const source = within(main).getByRole("link", { name: /UVHVVR/ });
    expect(source.getAttribute("href")).toBe("https://example.test/shelter-registry.docx");
    expect(source.closest("p")?.textContent).toContain(edition);
    expect(source.closest("p")?.textContent).toContain(supplement);
    const publication = verificationTime("2026-10-15T12:00:00.000Z", locale);
    expect(container.querySelector("footer")?.textContent).toContain(publication);
    expect(main.textContent).not.toContain(publication);
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
