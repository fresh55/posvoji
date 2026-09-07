// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SITE_URL } from "@/lib/site";
import { SRECKO_PATHS } from "@/lib/srecko";
import { qrSymbol } from "./qr-code";
import { SreckoPoster } from "./srecko-poster";

afterEach(cleanup);

function sheet(locale: "sl" | "en" = "sl") {
  return render(<SreckoPoster locale={locale} />);
}

/** Every tile on the sheet, in the order it is printed. */
function tiles(container: HTMLElement): string[] {
  return [...container.querySelectorAll(".poster-tile")].map(
    (tile) => tile.textContent ?? "",
  );
}

describe("the name and the word beside it", () => {
  it("says his name and that he was adopted", () => {
    const { container } = sheet();

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Srečko");
    expect(container.querySelector(".poster-status")?.textContent).toBe(
      "posvojeno",
    );
  });

  it("says the same in English", () => {
    const { container } = sheet("en");

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Srečko");
    expect(container.querySelector(".poster-status")?.textContent).toBe(
      "adopted",
    );
  });

  it("never claims he is looking for a home", () => {
    // "išče dom" is a claim, and he is not making it. The register's sheet
    // drops that line for a reserved animal; this one drops it for good.
    const { container } = sheet();
    expect(container.querySelector(".poster-seeking")).toBeNull();
    expect(container.textContent).not.toContain("išče dom");
    cleanup();

    const { container: english } = sheet("en");
    expect(english.textContent).not.toContain("is looking for a home");
  });
});

describe("what the sheet does not say", () => {
  it("names no shelter", () => {
    // The about page promises that nobody buys a place on the list, and
    // sending every reader of this sheet to one shelter out of seventeen is
    // the nearest thing to breaking it. "V zavetišču" is as far as it goes.
    const { container } = sheet();
    const text = container.textContent ?? "";

    expect(text).not.toMatch(/Mačja hiša/i);
    expect(text).not.toMatch(/Macja hisa/i);
    expect(container.querySelector(".poster-shelter-name")).toBeNull();
    expect(container.querySelector(".poster-shelter-phone")).toBeNull();
  });

  it("dates the paper from nothing, because there is no dataset behind him", () => {
    const { container } = sheet();
    expect(container.textContent).not.toContain("stanje");
    cleanup();

    const { container: english } = sheet("en");
    expect(english.textContent).not.toContain("as of");
  });

  it("invents no dates for the three moments", () => {
    // The record holds none today (lib/srecko.ts), so the moments are told
    // without them.
    const { container } = sheet();
    expect(container.querySelector(".poster-timeline")?.textContent).toBe(
      "V zavetišču · Posvojen · Umrl",
    );
    cleanup();

    const { container: english } = sheet("en");
    expect(english.querySelector(".poster-timeline")?.textContent).toBe(
      "In a shelter · Adopted · Died",
    );
  });
});

describe("the fact tiles", () => {
  it("prints the three things that are true about him and nothing else", () => {
    const { container } = sheet();

    expect(tiles(container)).toEqual(["Maček", "Eno oko", "FeLV pozitiven"]);
    expect(tiles(container)).toHaveLength(3);
    cleanup();

    const { container: english } = sheet("en");
    expect(tiles(english)).toEqual(["Cat", "One eye", "FeLV positive"]);
  });

  it("gives the positive test the amber and not the filter green", () => {
    // The green states a health record a visitor is looking for. A positive
    // FeLV test is what the "Brez FeLV" filter hides, so printing it in that
    // green would sell it as a credential.
    const { container } = sheet();

    expect(container.querySelector(".poster-tile--health")).toBeNull();
    expect(
      container.querySelector('[data-fact="felv"]')?.className,
    ).toContain("poster-tile--wait");
  });
});

describe("the picture", () => {
  it("prints the page's own render while there are no photographs of him", () => {
    const { container } = sheet();

    const images = [...container.querySelectorAll("img")];
    expect(images.map((image) => image.getAttribute("src"))).toEqual([
      "/models/our-cat/poster.webp",
    ]);
    // No blurred fill behind it: the render is opaque and white to its edges,
    // so its frame is the paper's own white.
    expect(container.querySelector(".poster-photo-fill")).toBeNull();
    expect(container.querySelector(".poster-photo--render")).toBeTruthy();
    expect(images[0]?.getAttribute("alt")).toContain("Srečko");
  });

  it("carries the model's credit, because paper has no footer to press", () => {
    // CC BY 4.0 asks for the credit to be carried with the work, and the
    // site's own disclosure lives in the footer.
    const { container } = sheet();
    const credit = container.querySelector(".poster-credit")?.textContent ?? "";

    expect(credit).toContain("mark2580");
    expect(credit).toContain("CC BY 4.0");
    cleanup();

    const { container: english } = sheet("en");
    expect(english.querySelector(".poster-credit")?.textContent).toContain(
      "CC BY 4.0",
    );
  });
});

describe("the band along the foot", () => {
  it("says why the site exists, in the about page's own words", () => {
    sheet();
    expect(screen.getByText("Ta stran je v spomin na Srečka.")).toBeTruthy();
    cleanup();

    sheet("en");
    expect(screen.getByText("This site is in memory of Srečko.")).toBeTruthy();
  });

  it("carries the site's own mark where an animal's sheet carries a shelter's", () => {
    const { container } = sheet();

    expect(container.querySelector(".poster-brand-mark")).toBeTruthy();
    expect(container.querySelector(".poster-wordmark")?.textContent).toBe(
      "posvoji.si",
    );
  });

  it("codes his page, and prints the same address in letters", () => {
    const { container } = sheet();

    const qr = container.querySelector('svg[role="img"]');
    expect(qr?.getAttribute("aria-label")).toContain("Srečko");
    // The symbol itself, and not just the label beside it: the code is what a
    // phone reads off the wall.
    expect(qr?.querySelector("path")?.getAttribute("d")).toBe(
      qrSymbol(`${SITE_URL}${SRECKO_PATHS.sl}`).path,
    );
    // The <wbr>s between the segments are break opportunities and carry no
    // text, so the line still reads as one address.
    expect(container.querySelector(".poster-url")?.textContent).toBe(
      "posvoji.si/o-nas/srecko",
    );
  });

  it("codes the English page from the English sheet", () => {
    // The register's sheets encode the page they were built from, and so does
    // his: a reader of the English sheet lands on the English page.
    const { container } = sheet("en");

    expect(container.querySelector('svg[role="img"] path')?.getAttribute("d")).toBe(
      qrSymbol(`${SITE_URL}${SRECKO_PATHS.en}`).path,
    );
    expect(container.querySelector(".poster-url")?.textContent).toBe(
      "posvoji.si/en/about/srecko",
    );
  });

  it("wears the settled word in the quiet tone, not the reservation amber", () => {
    const { container } = sheet();

    const status = container.querySelector(".poster-status");
    expect(status?.classList.contains("poster-status--quiet")).toBe(true);
  });
});
