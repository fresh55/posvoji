// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AboutCatCard } from "./about-cat-card";
import type { Locale } from "@/lib/i18n";

afterEach(cleanup);

describe("the cat's card", () => {
  it.each<Locale>(["sl", "en"])("names him in %s", (locale) => {
    render(<AboutCatCard locale={locale} />);

    expect(screen.getByText("Srečko")).not.toBeNull();
  });

  it.each<Locale>(["sl", "en"])("says he was adopted (%s)", (locale) => {
    const { container } = render(<AboutCatCard locale={locale} />);

    expect(container.textContent).toMatch(
      locale === "sl" ? /Posvojili smo ga/ : /We adopted him/,
    );
  });

  // The two lines this card is not allowed to cross, both of them the page's
  // own promises. It sits a row above "nobody pays for a place or a better
  // position on the list", so it names no shelter and links to none: the
  // site's about page picking one out of seventeen is the nearest thing to
  // breaking that. And the page's fourth fact is that personal details do not
  // belong here, so the household stays out of it too.
  it.each<Locale>(["sl", "en"])("advertises nobody (%s)", (locale) => {
    const { container } = render(<AboutCatCard locale={locale} />);

    expect(screen.queryByRole("link")).toBeNull();
    expect(container.textContent ?? "").not.toMatch(
      /Mačja|Mačji|hiša|hiši|Celje|@|\+386/,
    );
  });
});
