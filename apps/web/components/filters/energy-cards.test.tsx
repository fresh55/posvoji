// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type { EnergyLevel } from "@posvoji/schema";
import { I18nProvider } from "@/components/i18n-provider";
import { groupOptions, type Unanswered } from "@/lib/filters";
import type { Locale } from "@/lib/i18n";
import { EnergyCards, TEMPOS } from "./energy-cards";
import type { FilterCardLayout } from "./filter-card";
import {
  installFilterFoldSeams,
  openFilterSection,
} from "@/test/filter-folds";
import { FilterGroupList, type CardGroup } from "./filter-groups";
import { pointerOff, pointerOnto } from "@/test/pointer";

installFilterFoldSeams();
// fireEvent's click carries detail 0, which is a keyboard's, so a reset
// pressed here hands focus to its section's heading, and a heading with a hint
// opens its tooltip on focus. Radix positions it with an observer jsdom does
// not ship.
class NoopResizeObserver { observe() {} unobserve() {} disconnect() {} }
globalThis.ResizeObserver ??= NoopResizeObserver as unknown as typeof ResizeObserver;

const options = groupOptions("energy", [], "sl");
const counts = new Map(options.map(({ value }) => [value, 3]));

function renderCards(
  overrides: {
    locale?: Locale;
    counts?: Map<string, number>;
    selected?: string[];
    onToggle?: (value: string) => void;
    onToggleMany?: (values: string[]) => void;
    unanswered?: Unanswered;
    layout?: FilterCardLayout;
  } = {},
) {
  const onToggle = overrides.onToggle ?? vi.fn();
  const onToggleMany = overrides.onToggleMany ?? vi.fn();
  render(
    <I18nProvider locale={overrides.locale ?? "sl"}>
      <EnergyCards
        options={options}
        counts={overrides.counts ?? counts}
        selected={overrides.selected ?? []}
        onToggle={onToggle}
        onToggleMany={onToggleMany}
        unanswered={overrides.unanswered}
        layout={overrides.layout}
      />
    </I18nProvider>,
  );
  return { onToggle, onToggleMany };
}

// The cards with their own selection, so a click really picks and unpicks.
function StatefulCards() {
  const [selected, setSelected] = useState<string[]>([]);
  return (
    <I18nProvider locale="sl">
      <EnergyCards
        options={options}
        counts={counts}
        selected={selected}
        onToggle={(value) =>
          setSelected((current) =>
            current.includes(value)
              ? current.filter((entry) => entry !== value)
              : [...current, value],
          )
        }
        onToggleMany={() => undefined}
      />
    </I18nProvider>
  );
}

const card = (label: string) =>
  screen.getByRole("button", { name: new RegExp(`^${label}, `) });

const glyphOf = (button: HTMLElement) =>
  button.querySelector("svg[data-energy-glyph]") as SVGSVGElement;

// The glyph sits in three spans, innermost first: the press, the gesture a
// pick plays, and the hover preview. Each owns its own transform.
const gestureSpan = (button: HTMLElement) =>
  glyphOf(button).parentElement?.parentElement as HTMLElement;
const previewSpan = (button: HTMLElement) =>
  gestureSpan(button).parentElement as HTMLElement;

const rotation = (element: HTMLElement) =>
  Number(/rotate\((-?[\d.]+)deg\)/.exec(element.style.transform)?.[1] ?? 0);

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Every transform Motion writes to the element until stop() is called. */
function recordTransforms(element: HTMLElement) {
  const seen: string[] = [];
  const observer = new MutationObserver(() => seen.push(element.style.transform));
  observer.observe(element, { attributes: true, attributeFilter: ["style"] });
  return {
    seen,
    stop: () => observer.disconnect(),
  };
}

describe("EnergyCards", () => {
  it("names the section and says where the answers come from", () => {
    renderCards();

    expect(screen.getByRole("heading", { name: "Energija" })).toBeTruthy();
    expect(screen.getByText("Po presoji zavetišča.")).toBeTruthy();
  });

  // Drawn under the rows rather than folded into the hint, because the hint is
  // a tooltip on a mouse and this is the one thing about the section a visitor
  // needs before the press: 380 of 491 animals have no energy on record.
  it("says how many animals a pick leaves out for having no answer", () => {
    renderCards({ unanswered: { asked: 491, unanswered: 380 } });
    expect(
      screen.getByText("Brez podatka: 380. Izbira pokaže le živali s podatkom."),
    ).toBeTruthy();
  });

  it("says it in English too", () => {
    renderCards({ locale: "en", unanswered: { asked: 491, unanswered: 380 } });
    expect(
      screen.getByText("No data: 380. Picking one shows only animals with data."),
    ).toBeTruthy();
  });

  // Every animal in the narrowing lacks the answer, so every level reads 0
  // and a pick has nothing to show: the line says that and nothing about a pick.
  it("says so plainly when no animal has an energy on record", () => {
    renderCards({
      counts: new Map(options.map(({ value }) => [value, 0])),
      unanswered: { asked: 23, unanswered: 23 },
    });
    expect(screen.getByText("Za nobeno od teh živali ni podatka.")).toBeTruthy();
    expect(screen.queryByText(/Izbira pokaže/)).toBeNull();
  });

  it("stays quiet about a gap too small to matter", () => {
    renderCards({ unanswered: { asked: 491, unanswered: 8 } });
    expect(screen.queryByText(/^Brez podatka/)).toBeNull();
  });

  it("renders one card per level with its label, count and aria-label", () => {
    renderCards();

    for (const { value, label } of options) {
      const button = screen.getByRole("button", {
        name: new RegExp(`^${label}, `),
      });
      expect(button.textContent).toContain(label);
      expect(button.textContent).toContain(String(counts.get(value)));
    }
  });

  it("reflects selection through aria-pressed", () => {
    renderCards({ selected: ["balanced"] });

    const cards = screen
      .getAllByRole("button")
      .filter((button) => button.getAttribute("aria-pressed") !== null);
    expect(cards.map((card) => card.getAttribute("aria-pressed"))).toEqual([
      "false",
      "true",
      "false",
    ]);
  });

  it("calls onToggle with the level's value", () => {
    const { onToggle } = renderCards();

    fireEvent.click(
      screen.getByRole("button", { name: new RegExp(`^${options[2].label}, `) }),
    );
    expect(onToggle).toHaveBeenCalledWith("lively");
  });

  it("calls onToggle again on a checked card, to deselect it", () => {
    const { onToggle } = renderCards({ selected: ["calm"] });

    fireEvent.click(
      screen.getByRole("button", { name: new RegExp(`^${options[0].label}, `) }),
    );
    expect(onToggle).toHaveBeenCalledWith("calm");
  });

  it("locks out a level no animal has, but never an active one", () => {
    renderCards({
      counts: new Map([
        ["calm", 0],
        ["balanced", 0],
        ["lively", 2],
      ]),
      selected: ["balanced"],
    });

    const button = (label: string) =>
      screen.getByRole("button", {
        name: new RegExp(`^${label}, `),
      }) as HTMLButtonElement;
    expect(button(options[0].label).disabled).toBe(true);
    expect(button(options[1].label).disabled).toBe(false);
    expect(button(options[2].label).disabled).toBe(false);
  });

  it("clears the whole section from its reset", () => {
    const { onToggleMany } = renderCards({ selected: ["calm", "lively"] });

    fireEvent.click(
      screen.getByRole("button", { name: "Ponastavi filter energije" }),
    );
    expect(onToggleMany).toHaveBeenCalledWith(["calm", "lively"]);
  });

  // The one place the celebration, the press anticipation and the hover
  // preview actually run: a keyframe array reaching a spring would throw here
  // rather than in review.
  it("plays every level's gesture without a motion error", () => {
    render(<StatefulCards />);

    for (const { label } of options) {
      const button = card(label);
      pointerOnto(button, "mouse");
      // The press pose is its own spring/tween path, so it gets driven too.
      fireEvent.pointerDown(button);
      fireEvent.pointerUp(button);
      fireEvent.click(button);
      expect(button.getAttribute("aria-pressed")).toBe("true");
    }

    // Unchecking drives each level's leave.
    for (const { label } of [...options].reverse()) {
      fireEvent.click(card(label));
      expect(card(label).getAttribute("aria-pressed")).toBe("false");
    }
    for (const index of [2, 0, 1]) {
      const button = card(options[index].label);
      fireEvent.click(button);
      expect(button.getAttribute("aria-pressed")).toBe("true");
    }
  });

  // The preview shows what a pick would play. Unticking a level with the
  // mouse still on it replayed it over the colour leaving: Miren nodded while
  // it sank, Živahen twitched while it fizzled.
  it("holds a level's preview back after an untick until the pointer leaves", async () => {
    render(<StatefulCards />);
    const miren = card("Miren");

    pointerOnto(miren, "mouse");
    await waitFor(() => expect(rotation(previewSpan(miren))).toBeCloseTo(-12));

    fireEvent.click(miren);
    fireEvent.click(miren);
    expect(miren.getAttribute("aria-pressed")).toBe("false");
    // Longer than the nod's own 0.5s.
    await wait(700);
    expect(rotation(previewSpan(miren))).toBe(0);

    pointerOff(miren);
    pointerOnto(miren, "mouse");
    await waitFor(() => expect(rotation(previewSpan(miren))).toBeCloseTo(-12));
  });

  it("draws Uravnotežen on without a settle after the draw", async () => {
    render(<StatefulCards />);

    // Miren rocks as it is picked, which is what makes the silence below
    // mean something: the recording does catch a turning glyph.
    const calm = recordTransforms(gestureSpan(card("Miren")));
    fireEvent.click(card("Miren"));
    await wait(400);
    calm.stop();
    expect(calm.seen.some((transform) => transform.includes("rotate"))).toBe(true);

    const balanced = recordTransforms(gestureSpan(card("Uravnotežen")));
    fireEvent.click(card("Uravnotežen"));
    // Past the end of the settle that used to follow the draw (0.5 + 0.45s).
    await wait(1100);
    balanced.stop();
    expect(balanced.seen.filter((transform) => transform.includes("rotate"))).toEqual([]);
  });

  // The watermark is a stamp on a card ground. A sidebar row has none, and
  // its mark sat a quarter under the tick box.
  it("stamps a chosen level's glyph on a sheet tile and not on a sidebar row", () => {
    const selected = options.map(({ value }) => value);
    const drawings = (value: string) => {
      const [stroke] = TEMPOS[value as EnergyLevel].glyph;
      const label = options.find((option) => option.value === value)?.label ?? value;
      return [...card(label).querySelectorAll("svg")].filter((svg) =>
        [...svg.querySelectorAll("path")].some((path) => path.getAttribute("d") === stroke),
      ).length;
    };

    renderCards({ selected, layout: "sheet" });
    for (const value of selected) expect(drawings(value)).toBe(2);
    cleanup();

    renderCards({ selected, layout: "sidebar" });
    for (const value of selected) expect(drawings(value)).toBe(1);
  });

  it("renders and toggles under reduced motion", () => {
    const originalMatchMedia = window.matchMedia;
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockImplementation((media: string) => ({
        matches: media === "(prefers-reduced-motion: reduce)",
        media,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });

    try {
      const { onToggle } = renderCards();

      fireEvent.click(
        screen.getByRole("button", {
          name: new RegExp(`^${options[0].label}, `),
        }),
      );

      expect(onToggle).toHaveBeenCalledWith("calm");
    } finally {
      Object.defineProperty(window, "matchMedia", {
        configurable: true,
        value: originalMatchMedia,
      });
    }
  });
});

describe("TEMPOS", () => {
  // A tapped card fills at once and its box waits for checkDelay. Velikost's
  // large paw holds it 0.42s; longer than that, a filled card around an empty
  // box reads as a control stuck mid-state.
  it.each(Object.entries(TEMPOS))(
    "ticks the %s box within 0.42s",
    (_level, tempo) => {
      expect(tempo.checkDelay).toBeLessThanOrEqual(0.42);
    },
  );
});

describe("FilterGroupList energy group", () => {
  const none: Unanswered = { asked: 0, unanswered: 0 };
  function renderList(
    selected: EnergyLevel[],
    {
      energyCounts = counts,
      unanswered,
    }: { energyCounts?: Map<string, number>; unanswered?: Unanswered } = {},
  ) {
    const onToggleMany = vi.fn();
    const group: CardGroup = "energy";

    render(
      <I18nProvider locale="sl">
        <FilterGroupList
          filters={{
            species: "all",
            sex: [],
            age: [],
            size: [],
            energy: selected,
            coatColor: [],
            coatLength: [],
            waiting: [],
            shelter: [],
            toggles: [],
            goodWith: [],
            care: [],
          }}
          groups={[{ group, options }]}
          counts={{
            sex: new Map(),
            age: new Map(),
            size: new Map(),
            energy: energyCounts,
            coatColor: new Map(),
            coatLength: new Map(),
            waiting: new Map(),
            shelter: new Map(),
          }}
          toggles={[]}
          toggleTally={new Map()}
          onToggle={() => undefined}
          onToggleMany={(_group, values) => onToggleMany(values)}
          onToggleProperty={() => undefined}
          onToggleManyProperties={() => undefined}
          unanswered={
            unanswered && {
              groups: {
                sex: none,
                age: none,
                size: none,
                energy: unanswered,
                coatColor: none,
                coatLength: none,
                waiting: none,
                shelter: none,
              },
              goodWith: { kids: none, dogs: none, cats: none },
              toggles: {
                sterilizacija: none,
                cepljenje: none,
                cip: none,
                "brez-fiv": none,
                "brez-felv": none,
              },
            }
          }
        />
      </I18nProvider>,
    );
    return { onToggleMany };
  }

  it("renders the energy section rather than the size paw cards", () => {
    renderList([]);

    expect(screen.getByRole("heading", { name: "Energija" })).toBeTruthy();
    openFilterSection("Energija");
    expect(screen.queryByRole("heading", { name: "Velikost" })).toBeNull();
    expect(document.querySelector("svg.lucide-paw-print")).toBeNull();
    // The levels draw their own two-layer glyphs rather than rendering lucide.
    expect(document.querySelector("[data-energy-glyph='calm']")).not.toBeNull();
    expect(
      document.querySelector("[data-energy-glyph='balanced']"),
    ).not.toBeNull();
    expect(
      document.querySelector("[data-energy-glyph='lively']"),
    ).not.toBeNull();
  });

  // /?zavetisce=zonzani: none of its 23 animals has an energy on record. The
  // sidebar keeps its one row reading 0, and the line under it says why
  // rather than telling the visitor to pick it.
  it("says no animal has an answer under the one row the sidebar keeps", () => {
    const zero = new Map(options.map(({ value }) => [value, 0]));
    renderList([], {
      energyCounts: zero,
      unanswered: { asked: 23, unanswered: 23 },
    });

    openFilterSection("Energija");
    const rows = screen
      .getAllByRole("button")
      .filter((button) => button.getAttribute("aria-pressed") !== null);
    expect(rows).toHaveLength(1);
    expect((rows[0] as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Za nobeno od teh živali ni podatka.")).toBeTruthy();
    expect(screen.queryByText(/Izbira pokaže/)).toBeNull();
  });

  it("keeps a picked level's row and the same line", () => {
    const zero = new Map(options.map(({ value }) => [value, 0]));
    renderList(["calm"], {
      energyCounts: zero,
      unanswered: { asked: 23, unanswered: 23 },
    });

    openFilterSection("Energija");
    const rows = screen
      .getAllByRole("button")
      .filter((button) => button.getAttribute("aria-pressed") !== null);
    expect(rows.map((row) => row.getAttribute("aria-pressed"))).toEqual(["true"]);
    expect(screen.getByText("Za nobeno od teh živali ni podatka.")).toBeTruthy();
  });

  it("clears the section from the reset the list wired up", () => {
    const { onToggleMany } = renderList(["calm"]);

    openFilterSection("Energija");
    fireEvent.click(
      screen.getByRole("button", { name: "Ponastavi filter energije" }),
    );
    expect(onToggleMany).toHaveBeenCalledWith(["calm"]);
  });
});
