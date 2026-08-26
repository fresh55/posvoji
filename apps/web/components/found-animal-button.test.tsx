// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OPEN_MUNICIPALITY_LOOKUP_EVENT } from "@/lib/found-animal";
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

// The dialog end of this contract is covered in location-picker.test.tsx,
// which opens the municipality mode by dispatching the event by hand. That
// leaves the half nothing was asserting: that pressing this button is what
// sends it. The two components never meet in the tree, so a dropped handler
// here would break the only way into the found-animal flow with every
// existing test still green.
describe("FoundAnimalButton", () => {
  it("asks for the municipality lookup when pressed", () => {
    const heard = vi.fn();
    window.addEventListener(OPEN_MUNICIPALITY_LOOKUP_EVENT, heard);

    setup();
    fireEvent.click(screen.getByRole("button"));

    expect(heard).toHaveBeenCalledTimes(1);
    window.removeEventListener(OPEN_MUNICIPALITY_LOOKUP_EVENT, heard);
  });

  it("says a dialog is what opens, and keeps its marks unnamed", () => {
    setup();
    const button = screen.getByRole("button");

    // Not decoration: buttonVariants reads aria-haspopup to drop the
    // press-down translate, so the two ways into this dialog answer a press
    // the same way.
    expect(button.getAttribute("aria-haspopup")).toBe("dialog");
    // The country silhouette that used to lead this control is gone (see the
    // component). The arrow that is left stays out of the name computed
    // below, and so would anything that replaced it.
    for (const svg of button.querySelectorAll("svg")) {
      expect(svg.getAttribute("aria-hidden")).toBe("true");
    }
  });

  // getByRole computes the accessible name, so matching it exactly is a claim
  // about the whole of it: the label carries the button and nothing else does.
  it.each([
    ["sl", "Si našel žival?"],
    ["en", "Found an animal?"],
  ] as const)("is named by its label alone in %s", (locale, name) => {
    setup(locale);

    expect(screen.getByRole("button", { name })).toBeTruthy();
  });
});
