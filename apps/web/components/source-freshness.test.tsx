// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { I18nProvider } from "./i18n-provider";
import { SourceFreshness } from "./source-freshness";

afterEach(() => { cleanup(); vi.useRealTimers(); });

it("ages an open static page without changing its source timestamp", async () => {
  vi.useFakeTimers();
  const checkedAt = "2026-09-13T06:00:00Z";
  const reference = new Date("2026-09-13T07:00:00Z");
  vi.setSystemTime(reference);
  const { container } = render(<I18nProvider locale="en"><SourceFreshness checkedAt={checkedAt} reference={reference} /></I18nProvider>);
  expect(screen.queryByText(/still available/)).toBeNull();
  vi.setSystemTime(new Date("2026-09-15T07:00:00Z"));
  await act(async () => { await vi.advanceTimersByTimeAsync(60000); });
  expect(screen.getByText(/still available/)).toBeTruthy();
  // The reader gets the date, the machine keeps the instant.
  expect(container.querySelector("time")?.dateTime).toBe(checkedAt);
  expect(container.querySelector("time")?.textContent).toBe("13 Sept 2026");
});

// One line, not two: the credit the provider requires and the check it is
// printed under say the same thing about the same listing.
it("prints the attribution and the check as one footnote line", () => {
  const reference = new Date("2026-09-13T07:00:00Z");
  const { container } = render(
    <I18nProvider locale="en">
      <SourceFreshness
        attribution="Foto in opis: Zavetišče Test"
        checkedAt="2026-09-13T06:00:00Z"
        reference={reference}
      />
    </I18nProvider>,
  );

  const line = container.querySelector("p");
  expect(line?.textContent).toBe(
    "Foto in opis: Zavetišče Test · Checked 13 Sept 2026",
  );
  // The credit is the provider's own Slovenian on an English page.
  expect(screen.getByText("Foto in opis: Zavetišče Test").getAttribute("lang"))
    .toBe("sl");
});

it("says the check time is unknown without repeating the word", () => {
  const reference = new Date("2026-09-13T07:00:00Z");
  const { container } = render(
    <I18nProvider locale="en">
      <SourceFreshness attribution="Foto: Zavetišče Test" reference={reference} />
    </I18nProvider>,
  );

  expect(container.querySelector("p")?.textContent).toBe(
    "Foto: Zavetišče Test · Check time unknown",
  );
  expect(container.querySelector("time")).toBeNull();
});
