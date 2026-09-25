// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/components/i18n-provider";
import {
  careOptions,
  EMPTY_FILTERS,
  facetCounts,
  goodWithOptions,
  groupOptions,
  TOGGLES,
} from "@/lib/filters";
import {
  installFilterFoldSeams,
  openAllFilterSections,
} from "@/test/filter-folds";
import { drawnOptions, FilterGroupList } from "./filter-groups";

installFilterFoldSeams();
class NoopResizeObserver { observe() {} unobserve() {} disconnect() {} }
globalThis.ResizeObserver ??= NoopResizeObserver as unknown as typeof ResizeObserver;

describe("the options a filter list draws", () => {
  // The sidebar draws the live options only: a row that answers nothing pushed
  // a section that does below the panel's own fold, 160 of the 243px it
  // overflowed at 1280x720 under /?vrsta=pes. The sheet keeps the tile, where
  // there is a page to scroll and a 0 to read.
  it("draws only the live options in the sidebar", () => {
    const options = ["a", "b", "c"];
    const dead = (option: string) => option !== "b";

    expect(drawnOptions(options, "sidebar", dead)).toEqual(["b"]);
    expect(drawnOptions(options, "sheet", dead)).toEqual(options);
  });

  // A section must not fold down to a bare heading, and it can: the section
  // survives on the species pool while its counts are taken against the whole
  // filter state, so one section's narrowing can zero every option of another.
  it("keeps one option when every option is dead", () => {
    expect(drawnOptions(["a", "b"], "sidebar", () => true)).toEqual(["a"]);
  });
});

/** The row whose name starts with this label, if the list drew one. */
function row(label: string): HTMLButtonElement | undefined {
  return screen
    .queryAllByRole<HTMLButtonElement>("button")
    .find((button) => button.getAttribute("aria-label")?.startsWith(`${label},`));
}

describe("a pick the sidebar keeps once it comes off", () => {
  // Every section that can drop a row, with nothing picked: one option reads
  // more than 0, one reads 0 and was picked earlier on the tab, and the rest
  // read 0 and never were.
  it("stays drawn and enabled at 0 in every section that drops a 0", () => {
    const counts = facetCounts([], EMPTY_FILTERS, new Date("2026-01-01"));
    counts.sex.set("male", 3);
    counts.size.set("small", 3);
    counts.energy.set("lively", 3);
    counts.coatLength.set("short", 3);
    counts.waiting.set("over-6-months", 3);
    const noop = vi.fn();
    render(
      <I18nProvider locale="sl">
        <FilterGroupList
          filters={EMPTY_FILTERS}
          groups={(
            ["sex", "size", "energy", "coatLength", "waiting"] as const
          ).map((group) => ({ group, options: groupOptions(group, [], "sl") }))}
          counts={counts}
          toggles={TOGGLES.filter(({ species }) => species === "cat")}
          toggleTally={new Map([["brez-fiv", 3]])}
          goodWith={{
            options: goodWithOptions("sl"),
            counts: new Map([["kids", 3]]),
            resultCount: 3,
            total: 3,
            onToggle: noop,
            onToggleMany: noop,
          }}
          care={{
            options: careOptions("sl"),
            counts: new Map([["patient", 3]]),
            resultCount: 3,
            total: 3,
            onToggle: noop,
            onToggleMany: noop,
          }}
          kept={{
            sex: ["female"],
            size: ["large"],
            energy: ["calm"],
            coatLength: ["long"],
            waiting: ["over-3-years"],
            toggles: ["brez-felv"],
            goodWith: ["cats"],
            care: ["bonded-pair"],
          }}
          onToggle={noop}
          onToggleMany={noop}
          onToggleProperty={noop}
          onToggleManyProperties={noop}
        />
      </I18nProvider>,
    );
    openAllFilterSections();

    // Drawn, and enabled, since a disabled row cannot hold focus.
    for (const label of [
      "Samica",
      "Velika",
      "Miren",
      "Dolga",
      "Nad 3 leta",
      "Brez FeLV",
      "Mačko",
      "Dom za dva",
    ]) {
      expect(row(label)?.disabled, label).toBe(false);
    }
    // Never picked, so left out like any other 0. Srednja is both a size and
    // a coat, and neither is drawn.
    for (const label of [
      "Srednja",
      "Uravnotežen",
      "Brez dlake",
      "Nad 1 leto",
      "Psa",
      "Dnevno nego",
      "Izkušeno roko",
    ]) {
      expect(row(label), label).toBeUndefined();
    }
  });
});
