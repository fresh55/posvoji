// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import type { Animal } from "@posvoji/schema";
import { afterEach, describe, expect, it } from "vitest";
import { AnimalFacts } from "@/components/animal-dialog/animal-facts";
import { I18nProvider } from "@/components/i18n-provider";

afterEach(cleanup);

const REFERENCE = new Date("2026-08-15T00:00:00Z");

function animal(extra: Partial<Animal> = {}): Animal {
  return {
    id: "a1",
    source: {
      providerId: "zavetisce",
      sourceUrl: "https://example.test/zival",
      fetchedAt: "2026-08-01T00:00:00Z",
      firstSeenAt: "2026-08-01T00:00:00Z",
      lastSeenAt: "2026-08-01T00:00:00Z",
    },
    shelter: { id: "s1", name: "Zavetišče", city: "Ljubljana" },
    name: "Muri",
    species: "cat",
    status: "available",
    images: [],
    attribution: "Vir: Zavetišče",
    ...extra,
  };
}

function renderFacts(extra: Partial<Animal> = {}) {
  render(
    <I18nProvider locale="sl">
      <AnimalFacts animal={animal(extra)} reference={REFERENCE} />
    </I18nProvider>,
  );
}

describe("the družba row", () => {
  it("says nothing at all when the shelter has answered nothing", () => {
    renderFacts({ sex: "female" });
    expect(screen.queryByRole("list", { name: "Družba" })).toBeNull();
  });

  it("stays away for an empty goodWith block too", () => {
    renderFacts({ goodWith: {} });
    expect(screen.queryByRole("list", { name: "Družba" })).toBeNull();
  });

  it("answers all three questions once one of them is known", () => {
    renderFacts({ goodWith: { kids: "yes" } });

    const row = screen.getByRole("list", { name: "Družba" });
    const items = within(row).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(within(row).getByText("Se razume z otroki")).toBeTruthy();
    expect(within(row).getByText("Psi: ni znano")).toBeTruthy();
    expect(within(row).getByText("Mačke: ni znano")).toBeTruthy();
  });

  it("softens a no instead of marking the animal down", () => {
    renderFacts({ goodWith: { kids: "no", dogs: "unknown", cats: "yes" } });

    const row = screen.getByRole("list", { name: "Družba" });
    expect(within(row).getByText("Raje brez otrok")).toBeTruthy();
    expect(within(row).getByText("Psi: ni znano")).toBeTruthy();
    expect(within(row).getByText("Se razume z mačkami")).toBeTruthy();
  });

  it("offers the shelter's reasoning only behind a yes", () => {
    renderFacts({ goodWith: { kids: "yes", dogs: "no" } });

    const row = screen.getByRole("list", { name: "Družba" });
    const buttons = within(row).getAllByRole("button");
    expect(buttons).toHaveLength(1);
    expect(buttons[0].textContent).toContain("Se razume z otroki");
  });

  it("names the animal in the popover sentence", async () => {
    renderFacts({ goodWith: { cats: "yes" } });

    const row = screen.getByRole("list", { name: "Družba" });
    within(row).getByRole("button").click();

    expect(
      await screen.findByText(
        "Zavetišče presoja, da se Muri razume z mačkami.",
      ),
    ).toBeTruthy();
  });
});

describe("the housing row", () => {
  it("stays away when the shelter has not answered", () => {
    renderFacts({ sex: "female" });
    expect(screen.queryByRole("list", { name: "Dom" })).toBeNull();
  });

  it("stays away for an unknown answer, which says nothing", () => {
    renderFacts({ apartmentOk: "unknown" });
    expect(screen.queryByRole("list", { name: "Dom" })).toBeNull();
  });

  it("shows a yes and explains it when asked", async () => {
    renderFacts({ apartmentOk: "yes" });

    const row = screen.getByRole("list", { name: "Dom" });
    const button = within(row).getByRole("button");
    expect(button.textContent).toContain("Primeren za stanovanje");

    button.click();
    expect(
      await screen.findByText(
        "Zavetišče presoja, da lahko Muri živi v stanovanju.",
      ),
    ).toBeTruthy();
  });

  it("states a no plainly, with nothing to open", () => {
    renderFacts({ apartmentOk: "no" });

    const row = screen.getByRole("list", { name: "Dom" });
    expect(
      within(row).getByText("Potrebuje več prostora kot stanovanje"),
    ).toBeTruthy();
    expect(within(row).queryByRole("button")).toBeNull();
  });
});

describe("the special care line", () => {
  it("says nothing unless the shelter marked the animal", () => {
    renderFacts({ specialNeeds: false });
    expect(
      screen.queryByText(
        "Ta žival potrebuje potrpežljivega človeka in nekaj več časa.",
      ),
    ).toBeNull();
  });

  it("asks for the right person rather than warning the visitor off", () => {
    renderFacts({ specialNeeds: true });
    expect(
      screen.getByText(
        "Ta žival potrebuje potrpežljivega človeka in nekaj več časa.",
      ),
    ).toBeTruthy();
  });
});
