// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/components/i18n-provider";
import { NewListingsNotice } from "./new-listings-notice";

afterEach(cleanup);

function notice(count: number, locale: "sl" | "en" = "sl") {
  const onShowFirst = vi.fn();
  render(
    <I18nProvider locale={locale}>
      <NewListingsNotice count={count} onShowFirst={onShowFirst} />
    </I18nProvider>,
  );
  return onShowFirst;
}

function drawn() {
  return document.querySelector('[data-slot="new-listings-notice"]');
}

describe("NewListingsNotice", () => {
  // Every first visit, every server render and the hydrating one.
  it("draws nothing at zero", () => {
    notice(0);
    expect(drawn()).toBeNull();
  });

  it("names the count and puts the new listings first on a press", () => {
    const onShowFirst = notice(12);

    expect(drawn()?.querySelector("p")?.textContent).toBe(
      "12 novih objav od tvojega zadnjega obiska.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Pokaži jih najprej" }));
    expect(onShowFirst).toHaveBeenCalledTimes(1);
  });

  // The sentence agrees with the numeral's last two digits, the ladder the
  // rest of the site counts with; the button's pronoun with how many there
  // are.
  it.each([
    [1, "1 nova objava od tvojega zadnjega obiska.", "Pokaži jo najprej"],
    [2, "2 novi objavi od tvojega zadnjega obiska.", "Pokaži ju najprej"],
    [3, "3 nove objave od tvojega zadnjega obiska.", "Pokaži jih najprej"],
    [4, "4 nove objave od tvojega zadnjega obiska.", "Pokaži jih najprej"],
    [5, "5 novih objav od tvojega zadnjega obiska.", "Pokaži jih najprej"],
    [101, "101 nova objava od tvojega zadnjega obiska.", "Pokaži jih najprej"],
    [102, "102 novi objavi od tvojega zadnjega obiska.", "Pokaži jih najprej"],
  ])("says %i in Slovenian", (count, sentence, button) => {
    notice(count);

    expect(drawn()?.querySelector("p")?.textContent).toBe(sentence);
    expect(screen.getByRole("button", { name: button })).toBeTruthy();
  });

  it.each([
    [1, "1 new listing since your last visit.", "Show it first"],
    [2, "2 new listings since your last visit.", "Show them first"],
    [101, "101 new listings since your last visit.", "Show them first"],
  ])("says %i in English", (count, sentence, button) => {
    notice(count, "en");

    expect(drawn()?.querySelector("p")?.textContent).toBe(sentence);
    expect(screen.getByRole("button", { name: button })).toBeTruthy();
  });
});
