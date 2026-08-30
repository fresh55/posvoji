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

// Enter used to take matches[0] whenever the list held anything, which on an
// ambiguous query answered a question about one občina with another one's
// shelter. What it takes now is an answer only where there is one.
describe("MunicipalityFinder enter key", () => {
  // Three entries a prefix cannot tell apart, one of which is also an exact
  // name. Ljubljana is first in the table, so a rule that takes the head of
  // the list looks right on the exact-name case and wrong on every other one.
  const AMBIGUOUS: LookupEntry[] = ["Ljubljana", "Ljubljana - Vič", "Ljubno"].map(
    (name, index) => ({
      name,
      nearest: [],
      coverage: [
        {
          shelterId: `shelter-${index}`,
          shelterName: `Zavetišče ${name}`,
          city: name,
          detailHref: `/zavetisca/shelter-${index}`,
          animals: 0,
          sourceLabel: "Test",
          sourceDate: "2026-01-01",
          confirmed: true,
        },
      ],
    }),
  );

  function renderAmbiguous() {
    render(
      <I18nProvider locale="sl">
        <MunicipalityFinder
          entries={AMBIGUOUS}
          selectableIds={new Set()}
          selected={[]}
          onToggle={() => undefined}
          onActiveShelters={() => undefined}
          onActiveMunicipality={() => undefined}
        />
      </I18nProvider>,
    );
    return screen.getByRole("searchbox");
  }

  it("does nothing destructive while several municipalities still match", () => {
    const search = renderAmbiguous();
    fireEvent.change(search, { target: { value: "Ljub" } });

    // All three are on the list and none of them is the answer yet.
    expect(screen.getByRole("button", { name: /Ljubljana - Vič/ })).toBeTruthy();

    fireEvent.keyDown(search, { key: "Enter" });

    // Nothing has been named as the responsible shelter: the answer block,
    // which is the only thing that carries "Kaj zdaj" and a reset beside it,
    // is not on screen. The shelter names themselves are no test of that,
    // because every row in the list already carries the one it would name.
    expect(screen.queryByText("Kaj zdaj")).toBeNull();
    // And the list is still there to pick from, which is the whole of what
    // the visitor has to act on.
    expect(screen.getByRole("button", { name: /Ljubno/ })).toBeTruthy();
  });

  it("takes an exact name over the ones that merely contain it", () => {
    const search = renderAmbiguous();
    fireEvent.change(search, { target: { value: "Ljubljana" } });

    fireEvent.keyDown(search, { key: "Enter" });

    // Somebody spelling their own občina out in full has named it, even
    // though "Ljubljana - Vič" matches the same string.
    expect(screen.getByText("Zavetišče Ljubljana")).toBeTruthy();
    expect(screen.queryByText("Zavetišče Ljubljana - Vič")).toBeNull();
  });

  it("folds diacritics on both sides of that comparison", () => {
    const search = renderAmbiguous();
    fireEvent.change(search, { target: { value: "ljubljana - vic" } });

    fireEvent.keyDown(search, { key: "Enter" });

    // The same folding the filter above the list uses, so a keyboard without
    // č is not a keyboard that cannot answer.
    expect(screen.getByText("Zavetišče Ljubljana - Vič")).toBeTruthy();
  });

  it("still takes the only match there is", () => {
    const search = renderAmbiguous();
    fireEvent.change(search, { target: { value: "Ljubno" } });

    fireEvent.keyDown(search, { key: "Enter" });

    expect(screen.getByText("Zavetišče Ljubno")).toBeTruthy();
  });
});
