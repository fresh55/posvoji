// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { I18nProvider } from "@/components/i18n-provider";
import type { LookupEntry } from "@/lib/municipality-coverage";
import { MunicipalityFinder } from "./municipality-finder";

afterEach(cleanup);

// Same three names as the component's own EXAMPLE_MUNICIPALITIES, with real
// coverage, so the fixture matches what the tap-to-try chips promise: a
// working lookup, not just an entry that resolves to nothing.
const ENTRIES: LookupEntry[] = [
  {
    name: "Ljubljana",
    nearest: [],
    coverage: [
      {
        shelterId: "ljubljana",
        shelterName: "Zavetišče Ljubljana",
        city: "Ljubljana",
        detailHref: "/zavetisca/ljubljana",
        animals: 0,
        sourceLabel: "Test",
        sourceDate: "2026-01-01",
        confirmed: true,
      },
    ],
  },
  {
    name: "Maribor",
    nearest: [],
    coverage: [
      {
        shelterId: "maribor",
        shelterName: "Zavetišče Maribor",
        city: "Maribor",
        detailHref: "/zavetisca/maribor",
        animals: 0,
        sourceLabel: "Test",
        sourceDate: "2026-01-01",
        confirmed: true,
      },
    ],
  },
  {
    name: "Koper",
    nearest: [],
    coverage: [
      {
        shelterId: "obalno",
        shelterName: "Zavetišče Obala",
        city: "Koper",
        detailHref: "/zavetisca/obalno",
        animals: 0,
        sourceLabel: "Test",
        sourceDate: "2026-01-01",
        confirmed: true,
      },
    ],
  },
];

function renderFinder() {
  return render(
    <I18nProvider locale="sl">
      <MunicipalityFinder
        entries={ENTRIES}
        selectableIds={new Set()}
        selected={[]}
        onToggle={() => undefined}
        onActiveShelters={() => undefined}
        onActiveMunicipality={() => undefined}
      />
    </I18nProvider>,
  );
}

describe("MunicipalityFinder example chips", () => {
  it("renders the three example municipalities in the empty state", () => {
    renderFinder();

    expect(screen.getByText("Npr.:")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Ljubljana" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Maribor" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Koper" })).toBeTruthy();
  });

  it("tapping a chip runs the same lookup as typing the name", () => {
    renderFinder();

    fireEvent.click(screen.getByRole("button", { name: "Koper" }));

    // The search box now holds the tapped name, same as if it had been typed.
    const search = screen.getByRole("searchbox") as HTMLInputElement;
    expect(search.value).toBe("Koper");
    // And the same single-match result the typed path resolves to: the
    // responsible shelter's card, with its name and call button.
    expect(screen.getByText("Zavetišče Obala")).toBeTruthy();
  });

  it("typing a name by hand resolves to the identical result the chip gives", () => {
    renderFinder();

    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "Maribor" },
    });

    expect(screen.getByText("Zavetišče Maribor")).toBeTruthy();
  });

  it("hides the examples once a lookup result is showing", () => {
    renderFinder();

    expect(screen.getByRole("button", { name: "Ljubljana" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Ljubljana" }));

    // The teaching aid's job is done: the result card is up, and the chips
    // (including the one that was just tapped) leave the space to it.
    expect(screen.queryByRole("button", { name: "Ljubljana" })).toBeNull();
    expect(screen.queryByText("Npr.:")).toBeNull();
  });
});
