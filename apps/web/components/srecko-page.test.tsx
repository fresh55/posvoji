// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SreckoPage } from "./srecko-page";
import { SRECKO, SRECKO_TEXT, SRECKO_PATHS, SRECKO_POSTER_PATHS, sreckoDateLabel, sreckoHomeDateRange, sreckoMilestones, sreckoPortrait, sreckoShareImage } from "@/lib/srecko";
Object.defineProperty(window, "matchMedia", { configurable: true, value: vi.fn(() => ({
  matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn(),
})) });
const recordedPhotos = [...SRECKO.photos];
afterEach(() => { cleanup(); SRECKO.photos.splice(0, SRECKO.photos.length, ...recordedPhotos); });
describe("Srečko's memorial", () => {
  it.each(["sl", "en"] as const)("explains the memorial before the portrait and offers waiting cats (%s)", locale => {
    const { container } = render(<SreckoPage locale={locale} />);
    const header = container.querySelector("main header")!;
    expect(header.textContent).toContain(SRECKO_TEXT[locale].memorial);
    expect(header.textContent).not.toMatch(/FeLV|posvojeno|adopted/);
    expect(header.compareDocumentPosition(container.querySelector("main img")!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole("link", { name: SRECKO_TEXT[locale].cats }).getAttribute("href")).toBe(`${locale === "sl" ? "/" : "/en"}?vrsta=macka`);
    expect(screen.getByRole("link", { name: SRECKO_TEXT[locale].poster }).getAttribute("href")).toBe(SRECKO_POSTER_PATHS[locale]);
    expect(container.querySelector("main")?.lastElementChild?.textContent).toBe(SRECKO_TEXT[locale].dedication);
    expect([...container.querySelectorAll("a")].map(a => a.getAttribute("href"))).toContain(SRECKO_PATHS[locale === "sl" ? "en" : "sl"]);
    expect(container.querySelector("main details")?.hasAttribute("open")).toBe(false);
    expect(screen.getByRole("heading", { name: SRECKO_TEXT[locale].dates })).toBeTruthy();
    expect(container.querySelectorAll("main time")).toHaveLength(1);
    expect(container.querySelector("main time")?.getAttribute("datetime")).toBe("2023-03-17");
    expect(screen.getByText(SRECKO.memory![locale])).toBeTruthy();
    expect(header.textContent).toContain(locale === "sl" ? "Mačje hiše" : "Mačja hiša");
    expect(container.textContent).not.toMatch(/ranked|uvrščen|filter skrije/);
  });
  it("uses the prepared photo and removes the model credit", () => {
    render(<SreckoPage locale="en" />);
    expect(screen.getAllByRole("img")).toHaveLength(4);
    expect(decodeURIComponent(screen.getAllByRole("img")[0].getAttribute("src") ?? "")).toContain(sreckoPortrait().src);
    expect(screen.getByText(SRECKO_TEXT.en.photoCredit)).toBeTruthy();
    expect(screen.queryByText("Model credit")).toBeNull();
  });
  it("keeps the credited illustration when no photographs are available", () => {
    SRECKO.photos.length = 0;
    render(<SreckoPage locale="en" />);
    expect(decodeURIComponent(screen.getByRole("img").getAttribute("src") ?? "")).toContain(sreckoPortrait().src);
    expect(screen.getByText("Model credit")).toBeTruthy();
    expect(screen.queryByText(SRECKO_TEXT.en.photoCredit)).toBeNull();
  });
  it("assigns separate localized cards to About and the memorial", () => {
    expect(new Set(["sl", "en"].flatMap(locale => ["about", "memorial"].map(surface =>
      sreckoShareImage(locale as "sl" | "en", surface as "about" | "memorial").url))).size).toBe(4);
  });
});
describe("recorded dates", () => {
  it("preserves year, month and day precision", () => {
    expect(sreckoDateLabel("2019", "sl")).toBe("2019");
    expect(sreckoDateLabel("2019-03", "sl")).toBe("marec 2019");
    expect(sreckoDateLabel("2019-03-04", "sl")).toBe("4. 3. 2019");
    expect(sreckoDateLabel("2019-03-04", "en")).toBe("4 March 2019");
  });
  it.each(["2019-13", "2019-02-30", "unknown", "2019-00"])("omits invalid dates: %s", date => {
    expect(sreckoDateLabel(date, "sl")).toBeUndefined();
    expect(sreckoMilestones("sl", [{ key: "listed", date }])).toEqual([]);
  });
  it("shows only dated milestones", () => {
    expect(sreckoMilestones("sl", [{ key: "listed" }, { key: "died" }])).toEqual([]);
    expect(sreckoMilestones("sl")).toEqual([
      { key: "adopted", label: "Prišel domov", date: "17. 3. 2023", iso: "2023-03-17" },
    ]);
    expect(sreckoMilestones("en", [{ key: "listed" }, { key: "adopted", date: "2019" }])).toEqual([
      { key: "adopted", label: "Came home", date: "2019", iso: "2019" },
    ]);
  });
  it("displays a range rather than manufacturing a duration from partial dates", () => {
    expect(sreckoHomeDateRange("sl", [{ key: "adopted", date: "2019" }, { key: "died", date: "2020" }])).toBe("2019 – 2020");
    expect(sreckoHomeDateRange("en", [{ key: "adopted", date: "2019-12-31" }, { key: "died", date: "2020-01-01" }])).toBe("31 December 2019 – 1 January 2020");
    expect(sreckoHomeDateRange("sl", [{ key: "adopted", date: "2020" }, { key: "died", date: "2019" }])).toBeUndefined();
    expect(sreckoHomeDateRange("sl")).toBeUndefined();
  });
});
