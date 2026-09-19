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
  expect(screen.getByText(/Last checked 2 days ago\./)).toBeTruthy();
  await act(async () => { await vi.advanceTimersByTimeAsync(24 * 60 * 60000); });
  expect(screen.getByText(/Last checked 3 days ago\./)).toBeTruthy();
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

it.each([undefined, "bad", "2026-09-14T07:00:00Z"])("treats an unreliable check as unknown: %s", (checkedAt) => {
  const reference = new Date("2026-09-13T07:00:00Z");
  const { container } = render(
    <I18nProvider locale="en">
      <SourceFreshness attribution="Foto: Zavetišče Test" checkedAt={checkedAt} reference={reference} />
    </I18nProvider>,
  );

  expect(container.querySelector("p")?.textContent).toBe(
    "Foto: Zavetišče Test · Check time unknown",
  );
  expect(container.querySelector("time")).toBeNull();
  expect(screen.getByText("Before visiting, check with the shelter that the animal is still available.")).toBeTruthy();
  expect(screen.queryByText(/Last checked/)).toBeNull();
});

it.each([
  ["sl", "Zadnje preverjanje: pred 31 urami."],
  ["en", "Last checked 31 hours ago."],
] as const)("renders the verification age in %s using the server reference initially", (locale, expected) => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-30T12:00:00Z"));
  render(
    <I18nProvider locale={locale}>
      <SourceFreshness
        checkedAt="2026-09-18T05:00:00Z"
        reference={new Date("2026-09-19T12:00:00Z")}
      />
    </I18nProvider>,
  );
  expect(screen.getByText((text) => text.endsWith(expected))).toBeTruthy();
});
