// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { I18nProvider } from "@/components/i18n-provider";
import { FilterSheetTrigger } from "./filter-sheet-trigger";

afterEach(cleanup);

function dock(activeCount: number) {
  return (
    <I18nProvider locale="sl">
      <FilterSheetTrigger activeCount={activeCount} />
    </I18nProvider>
  );
}

describe("FilterSheetTrigger", () => {
  it("names the count it carries", () => {
    render(dock(2));

    expect(
      screen.getByRole("button", { name: "Filtri, aktivnih: 2" }),
    ).toBeTruthy();
  });

  // The dock's badge went in one frame when the last filter came off, while
  // the sidebar's faded out on its last number: the same badge, two ways.
  it("lets the badge leave on its last number rather than vanish", async () => {
    const { rerender } = render(dock(1));
    const button = screen.getByRole("button");
    expect(button.textContent).toBe("Filtri1");

    rerender(dock(0));

    expect(button.textContent).toBe("Filtri1");
    await waitFor(() => expect(button.textContent).toBe("Filtri"));
    expect(button.getAttribute("aria-label")).toBe("Filtri");
  });
});
