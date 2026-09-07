// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SITE_URL } from "@/lib/site";
import { SRECKO, SRECKO_PATHS, SRECKO_TEXT, sreckoPortrait } from "@/lib/srecko";
import { qrSymbol } from "./qr-code";
import { SreckoPoster } from "./srecko-poster";
afterEach(() => { cleanup(); SRECKO.photos.length = 0; });
describe("memorial poster", () => {
  it.each(["sl", "en"] as const)("identifies a memorial without an adoption status or medical tiles (%s)", locale => {
    const { container } = render(<SreckoPoster locale={locale} />);
    expect(container.querySelector("header")?.textContent).toContain(SRECKO_TEXT[locale].memorial);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(SRECKO.name);
    expect(container.querySelector(".poster-status")).toBeNull();
    expect(container.querySelector(".poster-tile")).toBeNull();
    expect(container.querySelector(".poster-timeline")).toBeNull();
    expect(screen.getByText(SRECKO_TEXT[locale].scan)).toBeTruthy();
    expect(screen.getByText(SRECKO_TEXT[locale].dedication)).toBeTruthy();
    expect(container.querySelector('svg[role="img"] path')?.getAttribute("d")).toBe(qrSymbol(`${SITE_URL}${SRECKO_PATHS[locale]}`).path);
    expect(container.querySelector(".poster-url")?.textContent).toBe(`posvoji.si${SRECKO_PATHS[locale]}`);
    expect(container.querySelector(".poster-credit")?.textContent).toContain("CC BY 4.0");
    expect(container.querySelector("img")?.getAttribute("src")).toBe(sreckoPortrait().src);
  });
  it("uses the same prepared portrait as the page and omits render credit", () => {
    SRECKO.photos.push({ src: "/test-portrait.webp", width: 800, height: 600, alt: { sl: "Srečko doma", en: "Srečko at home" } });
    const { container } = render(<SreckoPoster locale="sl" />);
    expect(container.querySelector("img")?.getAttribute("src")).toBe(sreckoPortrait().src);
    expect(container.querySelector(".poster-credit")).toBeNull();
  });
});
