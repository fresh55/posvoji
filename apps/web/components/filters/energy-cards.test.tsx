// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EnergyLevel } from "@posvoji/schema";
import { I18nProvider } from "@/components/i18n-provider";
import { groupOptions, type Unanswered } from "@/lib/filters";
import type { Locale } from "@/lib/i18n";
import { EnergyCards, TEMPOS } from "./energy-cards";
import {
  installFilterFoldSeams,
  openFilterSection,
} from "@/test/filter-folds";
import { FilterGroupList, type CardGroup } from "./filter-groups";
import { pointerOnto } from "@/test/pointer";

// Motion asks matchMedia for "(prefers-reduced-motion)", not the ": reduce"
// form, and only once per file, keeping the answer. A stub installed by one
// test never reaches it, so the hook is the seam.
const motion = vi.hoisted(() => ({ reduced: false }));
vi.mock("motion/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("motion/react")>()),
  useReducedMotion: () => motion.reduced,
}));

afterEach(() => {
  motion.reduced = false;
});

installFilterFoldSeams();

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

    // Unchecking puts a hovered card back into its preview.
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

  // Picks every level and says what each pick drew around its icon: the ring
  // that leaves it, and the particles Miren and Živahen throw, each drawn in a
  // 6-unit box. The tick box is the card's other bordered mark and is square.
  function pickEveryLevel() {
    render(<StatefulCards />);
    return options.map(({ label }) => {
      const button = card(label);
      fireEvent.click(button);
      expect(button.getAttribute("aria-pressed")).toBe("true");
      return {
        ring:
          button.querySelector("span.rounded-full.border-brand-strong") !==
          null,
        particles: button.querySelectorAll('svg[viewBox="0 0 6 6"]').length,
      };
    });
  }

  it("picks every level under reduced motion without a ring or particles", () => {
    const moving = pickEveryLevel();
    cleanup();
    motion.reduced = true;
    const still = pickEveryLevel();

    // Both are really drawn with motion on, or their absence proves nothing.
    expect(moving.every(({ ring }) => ring)).toBe(true);
    expect(moving.some(({ particles }) => particles > 0)).toBe(true);
    expect(still).toEqual(options.map(() => ({ ring: false, particles: 0 })));
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
