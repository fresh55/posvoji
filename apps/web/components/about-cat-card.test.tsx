// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AboutCatCard } from "./about-cat-card";
import type { Locale } from "@/lib/i18n";
import { shelterPath } from "@/lib/shelter-path";

afterEach(cleanup);

describe("the cat's card", () => {
  it.each<Locale>(["sl", "en"])("names him in %s", (locale) => {
    render(<AboutCatCard locale={locale} />);

    expect(screen.getByText("Srečko")).not.toBeNull();
  });

  // The point of the card. The shelter is a destination on this site rather
  // than a mention, so the sentence ends on a way into its animals, and the
  // address comes from the same helper the rest of the site routes through
  // rather than being written out here a second time.
  it.each<Locale>(["sl", "en"])(
    "links the shelter he came from (%s)",
    (locale) => {
      render(<AboutCatCard locale={locale} />);

      const link = screen.getByRole("link");
      expect(link.getAttribute("href")).toBe(shelterPath("macja-hisa", locale));
    },
  );

  // The page's fourth fact is that personal details do not belong on the
  // site. The card sits two rows above that sentence, so it stays about the
  // cat and the shelter.
  it("keeps the household out of it", () => {
    const { container } = render(<AboutCatCard locale="sl" />);

    const text = container.textContent ?? "";
    expect(text).toContain("Mačji hiši");
    expect(text).not.toMatch(/@|\+386|Bruno/);
  });
});
