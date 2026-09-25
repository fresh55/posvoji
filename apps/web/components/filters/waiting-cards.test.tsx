// @vitest-environment jsdom

import { fireEvent, render, renderHook, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/components/i18n-provider";
import { useAnimalFilterModel } from "@/components/use-animal-filter-model";
import {
  careOptions,
  EMPTY_FILTERS,
  facetCounts,
  FILTER_FACETS,
  GROUPS,
  groupOptions,
  type Filters,
  type WaitingGroup,
} from "@/lib/filters";
import type { Locale } from "@/lib/i18n";
import { installFilterFoldSeams, openFilterSection } from "@/test/filter-folds";
import { FilterGroupList, type CardGroup } from "./filter-groups";
import {
  checkDelayOf,
  grainTrack,
  pickEnd,
  POUR_AT,
  POURS,
  WaitingCards,
  WaitingMark,
  waitingTracks,
} from "./waiting-cards";

installFilterFoldSeams();
class NoopResizeObserver { observe() {} unobserve() {} disconnect() {} }
globalThis.ResizeObserver ??= NoopResizeObserver as unknown as typeof ResizeObserver;

const THRESHOLDS = Object.keys(POURS) as WaitingGroup[];

function renderCards(locale: Locale = "sl", selected: string[] = []) {
  const options = groupOptions("waiting", [], locale);
  render(
    <I18nProvider locale={locale}>
      <WaitingCards
        options={options}
        counts={new Map(options.map(({ value }) => [value, 3]))}
        selected={selected}
        onToggle={vi.fn()}
        onToggleMany={vi.fn()}
        layout="sidebar"
      />
    </I18nProvider>,
  );
}

describe("the waiting section's heading", () => {
  // The rows are durations, and under a heading that named a place they read
  // as the animal's age. "Waiting for a home" ran 17px under the Reset in the
  // 224px sidebar (metadata.ts), so English says "Waiting".
  it.each([
    ["sl", "Čaka na dom"],
    ["en", "Waiting"],
  ] as const)("names the wait in %s", (locale, heading) => {
    renderCards(locale);
    expect(screen.getByRole("heading", { name: heading })).toBeTruthy();
  });

  it("says the rows are counted from the day the animal came in", () => {
    renderCards("sl");
    expect(
      screen.getByText(
        "Šteto od dneva, ko je žival prišla v zavetišče. Izbereš lahko eno mejo.",
      ),
    ).toBeTruthy();
  });
});

describe("the waiting section's count column", () => {
  // The real check is visual: 1000 and 10000 injected into the 214px sidebar
  // row at 1440 and 1024, measured clear of the label and the round mark.
  // jsdom has no layout, so this pins the class contract that holds it: a
  // column that starts at w-6 and grows with its digits, never a fixed width
  // a fourth digit would spill out of into the mark.
  it("grows with its digits and stays right-aligned in the sidebar", () => {
    renderCards("sl");
    const rows = screen.getAllByRole("button", { pressed: false });
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      const count = row.querySelector(".tabular-nums");
      expect(count).not.toBeNull();
      const classes = [...(count?.classList ?? [])];
      expect(classes).toEqual(
        expect.arrayContaining(["min-w-6", "w-auto", "shrink-0", "text-right"]),
      );
      expect(classes.filter((name) => /^w-(?!auto$)/.test(name))).toEqual([]);
    }
  });
});

describe("the waiting section's place in the panel", () => {
  function show(layout: "sidebar" | "sheet", filters: Filters = EMPTY_FILTERS) {
    const counts = facetCounts([], EMPTY_FILTERS, new Date("2026-09-21"));
    counts.waiting.set("over-1-year", 4);
    counts.energy.set("calm", 2);
    counts.coatLength.set("long", 1);
    // In GROUPS order, as the page hands them over.
    const groups = GROUPS.filter(
      (group): group is CardGroup =>
        ["sex", "age", "energy", "coatLength", "waiting"].includes(group),
    );
    render(
      <I18nProvider locale="sl">
        <FilterGroupList
          layout={layout}
          filters={filters}
          groups={groups.map((group) => ({
            group,
            options: groupOptions(group, [], "sl"),
          }))}
          counts={counts}
          toggles={[]}
          toggleTally={new Map()}
          care={{
            options: careOptions("sl"),
            counts: new Map([["patient", 1]]),
            resultCount: 1,
            total: 3,
            onToggle: vi.fn(),
            onToggleMany: vi.fn(),
          }}
          onToggle={vi.fn()}
          onToggleMany={vi.fn()}
          onToggleProperty={vi.fn()}
          onToggleManyProperties={vi.fn()}
        />
      </I18nProvider>,
    );
  }

  const headings = () =>
    [...document.querySelectorAll("h3 button[aria-expanded]")].map((button) =>
      button.firstElementChild?.textContent?.trim(),
    );

  // Last, and so as far from Starost as the panel goes: beside the age rows
  // the same months and years read as an age.
  it.each(["sidebar", "sheet"] as const)("closes the list in the %s", (layout) => {
    show(layout);
    expect(headings()).toEqual([
      "Spol",
      "Starost",
      "Energija",
      "Videz",
      "Lahko ponudim",
      "Čaka na dom",
    ]);
    openFilterSection("Čaka na dom");
    expect(screen.getByRole("button", { name: /^Nad 1\sleto,/ })).toBeTruthy();
  });

  it("summarises a closed section as it reads open", () => {
    show("sidebar", { ...EMPTY_FILTERS, waiting: ["over-1-year"] });
    // The answered section opens itself; folded again it names its answer.
    const trigger = openFilterSection("Čaka na dom");
    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(trigger.textContent).toContain("Nad 1\u00a0leto");
  });

  it("puts its chip last in the active filters row, as the panel does", () => {
    const noop = () => undefined;
    const { result } = renderHook(() =>
      useAnimalFilterModel({
        animals: [],
        logos: {},
        reference: new Date("2026-09-21"),
        locale: "sl",
        resultCount: 0,
        actions: {
          filters: {
            ...EMPTY_FILTERS,
            waiting: ["over-1-year"],
            sex: ["male"],
            care: ["patient"],
          },
          toggle: noop,
          toggleProperty: noop,
          toggleGoodWith: noop,
          toggleManyGoodWith: noop,
          toggleCare: noop,
          toggleManyCare: noop,
        },
      }),
    );
    expect(result.current.chips.map((chip) => chip.facet)).toEqual([
      "sex",
      "care",
      "waiting",
    ]);
    expect(result.current.chips.at(-1)?.label).toBe("Čaka nad 1\u00a0leto");
    // The chips row spells the order out by hand; this holds it to the list.
    const rank = result.current.chips.map((chip) =>
      FILTER_FACETS.indexOf(chip.facet),
    );
    expect(rank).toEqual([...rank].sort((a, b) => a - b));
  });

  it("lists every facet once, in the panel's order", () => {
    expect(new Set(FILTER_FACETS).size).toBe(FILTER_FACETS.length);
    expect([...FILTER_FACETS].sort()).toEqual(
      [...GROUPS, "toggles", "goodWith", "care"].sort(),
    );
    expect(FILTER_FACETS.at(-1)).toBe("waiting");
  });
});

describe("the pour", () => {
  // Tempo as identity, the way Energija and Velikost vary per option: six
  // months is a short trickle and three years a longer pour.
  it("runs longer for a longer wait", () => {
    const durations = THRESHOLDS.map((value) => POURS[value].duration);
    expect(durations).toEqual([...durations].sort((a, b) => a - b));
    expect(new Set(durations).size).toBe(THRESHOLDS.length);
  });

  // A threshold is being picked, not a gesture being watched.
  it.each(THRESHOLDS)("lands %s within 0.6s and ticks as the sand settles", (value) => {
    const pour = POURS[value];
    expect(pickEnd(pour)).toBeLessThanOrEqual(0.6);
    expect(checkDelayOf(value)).toBeCloseTo(POUR_AT + pour.duration);
    expect(checkDelayOf(value)).toBeLessThan(pickEnd(pour));
  });

  it("turns the glass over on a tween, never a spring", () => {
    const { turn } = waitingTracks(POURS["over-1-year"], {
      checked: true,
      reduced: false,
      resetDelay: 0,
    });
    expect(turn.animate).toEqual({ rotate: [180, -8, 0] });
    expect(turn.transition).not.toHaveProperty("type");
    expect(turn.transition).toMatchObject({ times: [0, 0.7, 1] });
  });

  it("holds a full top and an empty bottom until the glass is upright", () => {
    const pour = POURS["over-3-years"];
    const { top, bottom } = waitingTracks(pour, {
      checked: true,
      reduced: false,
      resetDelay: 0,
    });
    for (const [track, from, to] of [
      [top, 4.2, pour.top],
      [bottom, 21.6, pour.bottom],
    ] as const) {
      expect(track.animate.attrY).toEqual([from, from, to]);
      // The wait is in the keyframes and not a delay, which would paint the
      // first keyframe over whatever the glass was showing.
      expect(track.transition).not.toHaveProperty("delay");
      const { times, duration } = track.transition as {
        times: number[];
        duration: number;
      };
      expect(times[1] * duration).toBeCloseTo(POUR_AT);
      expect(duration).toBeCloseTo(POUR_AT + pour.duration);
    }
  });

  // The drawing a pick comes to rest on has to be the static one, or the chip
  // (WaitingMark) and the picked row would show two different glasses. The
  // accent top is FULL_TOP cut at POURS[value].top, and each SAND top starts
  // on that line.
  it.each(THRESHOLDS)("rests %s on the drawing the chip shows", (value) => {
    const { container } = render(<WaitingMark value={value} />);
    const [top] = [...container.querySelectorAll("g path")].map((path) =>
      path.getAttribute("d"),
    );
    const firstY = Number(/^M[\d.]+ ([\d.]+)/.exec(top ?? "")?.[1]);
    expect(firstY).toBeCloseTo(POURS[value].top);
  });
});

describe("letting a threshold go", () => {
  // Why: the convention correction in the filter motion notes. The reset's
  // stagger used to stop at the icon well's halo and never reach the drawing.
  it("waits its turn in a reset, in the drawing and not only in the halo", () => {
    const tracks = waitingTracks(POURS["over-1-year"], {
      checked: false,
      reduced: false,
      resetDelay: 0.09,
    });
    for (const part of ["ink", "sand"] as const) {
      expect(tracks[part].transition).toMatchObject({ delay: 0.09 });
      expect(
        (tracks[part].transition as { duration: number }).duration,
      ).toBeGreaterThan(0);
    }
    // The muted sand waits for the glass to stand upright, and the cut edges
    // settle only once the accent has drained.
    for (const part of ["rest", "top", "bottom", "stream"] as const) {
      expect(
        (tracks[part].transition as { delay: number }).delay,
      ).toBeGreaterThan(0.09);
    }
  });

  it("drains rather than snapping when nothing is resetting", () => {
    const { ink, sand } = waitingTracks(POURS["over-6-months"], {
      checked: false,
      reduced: false,
      resetDelay: 0,
    });
    expect(ink.animate).toEqual({ opacity: 0 });
    expect((ink.transition as { duration: number }).duration).toBeGreaterThan(0);
    expect((sand.transition as { duration: number }).duration).toBeGreaterThan(0);
  });
});

describe("under reduced motion", () => {
  it.each([true, false])("lands every part at once (checked: %s)", (checked) => {
    const pour = POURS["over-3-years"];
    const tracks = waitingTracks(pour, { checked, reduced: true, resetDelay: 0.09 });
    for (const track of Object.values(tracks)) {
      expect(track.transition).toEqual({ duration: 0 });
      // No keyframes anywhere: every value is where it rests.
      for (const value of Object.values(track.animate)) {
        expect(Array.isArray(value)).toBe(false);
      }
    }
    expect(tracks.turn.animate).toEqual({ rotate: 0 });
    expect(tracks.stream.animate).toMatchObject({ opacity: 0 });
    expect(tracks.top.animate).toEqual({ attrY: pour.top });
    expect(tracks.bottom.animate).toEqual({ attrY: pour.bottom });
    expect(tracks.ink.animate).toEqual({ opacity: checked ? 1 : 0 });
    expect(tracks.rest.animate).toEqual({ opacity: checked ? 0 : 0.45 });
  });
});

describe("the hover", () => {
  it("drops the second grain after the first, with the wait in the keyframes", () => {
    const pour = POURS["over-1-year"];
    const first = grainTrack(pour, 0);
    const second = grainTrack(pour, 0.12);
    expect(first.animate.attrY).toHaveLength(2);
    expect(second.animate.attrY).toEqual([12.6, 12.6, pour.bottom - 1.3]);
    const { times, duration } = (second.transition as {
      attrY: { times: number[]; duration: number };
    }).attrY;
    expect(times[1] * duration).toBeCloseTo(0.12);
  });
});
