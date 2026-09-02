// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { FOUND_ANIMAL_PATHS } from "@/lib/found-animal";
import { I18nProvider } from "@/components/i18n-provider";
import { type Locale } from "@/lib/i18n";
import { FoundAnimalButton } from "./found-animal-button";

afterEach(() => cleanup());

const setup = (locale: Locale = "sl") =>
  render(
    <I18nProvider locale={locale}>
      <FoundAnimalButton />
    </I18nProvider>,
  );

// This is the hero's only mention of the found-animal flow, and it used to
// open the map dialog by dispatching a window event nothing else on the page
// could see. It is a link to the flow's own page now, so what has to be
// asserted is the href: a control that still draws its label while pointing
// nowhere would leave every existing test green.
describe("FoundAnimalButton", () => {
  it.each([
    ["sl", FOUND_ANIMAL_PATHS.sl],
    ["en", FOUND_ANIMAL_PATHS.en],
  ] as const)("links to the found-animal page in %s", (locale, href) => {
    setup(locale);

    expect(screen.getByRole("link").getAttribute("href")).toBe(href);
  });

  it("is a link and not a dialog opener", () => {
    setup();
    const link = screen.getByRole("link");

    // aria-haspopup="dialog" was the old contract, back when this opened the
    // picker on its found-animal tab. Nothing pops up any more, and a link
    // that claims it does is a link screen-reader users will not follow.
    expect(link.getAttribute("aria-haspopup")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
    // The country silhouette that used to lead this control is gone (see the
    // component). The arrow that is left stays out of the name computed
    // below, and so would anything that replaced it.
    for (const svg of link.querySelectorAll("svg")) {
      expect(svg.getAttribute("aria-hidden")).toBe("true");
    }
  });

  // getByRole computes the accessible name, so matching it exactly is a claim
  // about the whole of it: the label carries the link and nothing else does.
  it.each([
    ["sl", "Si našel žival?"],
    ["en", "Found an animal?"],
  ] as const)("is named by its label alone in %s", (locale, name) => {
    setup(locale);

    expect(screen.getByRole("link", { name })).toBeTruthy();
  });
});
