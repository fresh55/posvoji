// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AboutCatCard } from "./about-cat-card";
import type { Locale } from "@/lib/i18n";
import { statusLabel } from "@/lib/labels";

afterEach(cleanup);

describe("the cat's passport", () => {
  it.each<Locale>(["sl", "en"])("names him in %s", (locale) => {
    render(<AboutCatCard locale={locale} />);

    expect(screen.getByText("Srečko")).not.toBeNull();
  });

  // The point of the card, and the one thing no other card on the site can
  // show. It reads the word from the same place the grid reads it, so the two
  // cannot end up calling the same state different things.
  it.each<Locale>(["sl", "en"])("carries the settled status (%s)", (locale) => {
    render(<AboutCatCard locale={locale} />);

    expect(screen.getByText(statusLabel("adopted", locale) ?? "")).not.toBeNull();
  });

  // Two facts, the rule the real card keeps. A third would be a line that
  // wraps on a phone, and the colour of his coat is in the picture anyway.
  it("states two facts and stops", () => {
    const { container } = render(<AboutCatCard locale="sl" />);

    const meta = container.querySelectorAll("p")[1];
    expect(meta?.textContent).toBe("Maček · iz zavetišča");
  });

  // Both promises the page makes a row or two below: nobody buys a place on
  // this list, and personal details do not belong on the site.
  it.each<Locale>(["sl", "en"])("advertises nobody (%s)", (locale) => {
    const { container } = render(<AboutCatCard locale={locale} />);

    expect(screen.queryByRole("link")).toBeNull();
    expect(container.textContent ?? "").not.toMatch(
      /Mačja|Mačji|hiša|hiši|Celje|@|\+386/,
    );
  });
});
