// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ModelCredit } from "./model-credit";
import type { Locale } from "@/lib/i18n";

afterEach(cleanup);

const TRIGGER_LABEL: Record<Locale, string> = {
  sl: "Avtorstvo modela",
  en: "Model credit",
};

const MODEL_URL = "https://sketchfab.com/models/836312def1b84e588866500a2bf79f0f";
const LICENSE_URL = "https://creativecommons.org/licenses/by/4.0/";

describe("the model credit disclosure", () => {
  it.each<Locale>(["sl", "en"])("names its trigger in %s", (locale) => {
    const { container } = render(<ModelCredit locale={locale} />);

    expect(container.querySelector("summary")?.textContent).toContain(
      TRIGGER_LABEL[locale],
    );
  });

  // The one that matters. CC BY 4.0 asks for the credit to travel with the
  // work, so it has to be in the markup before anyone presses anything and
  // whether or not a script ever runs. Asserted against the closed element,
  // because a disclosure that mounts its content on open would pass a test
  // that clicked first.
  it("carries the credit and its license in the markup while closed", () => {
    const { container } = render(<ModelCredit locale="en" />);

    const details = container.querySelector("details");
    expect(details?.hasAttribute("open")).toBe(false);
    expect(details?.textContent).toContain("Shape, coat and animation adapted");

    const hrefs = screen
      .getAllByRole("link")
      .map((link) => link.getAttribute("href"));
    expect(hrefs).toContain(MODEL_URL);
    expect(hrefs).toContain(LICENSE_URL);
  });

  it("sends both credit links to a new tab", () => {
    render(<ModelCredit locale="sl" />);

    for (const link of screen.getAllByRole("link")) {
      expect(link.getAttribute("target")).toBe("_blank");
      // Contains rather than equals: tightening this to "noopener noreferrer"
      // is strictly better and should not fail the test that guards it.
      expect(link.getAttribute("rel")).toContain("noreferrer");
    }
  });
});
