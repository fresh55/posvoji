// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ScanLine, Scissors, Syringe, TestTubeDiagonal } from "lucide-react";
import { I18nProvider } from "@/components/i18n-provider";
import { HEALTH_ICONS } from "@/lib/animal-icons";
import { TOGGLES, toggleLabel, type ToggleKey } from "@/lib/filters";
import { FILTER_TOGGLE_KEYS } from "@/lib/filters/contracts";
import { getMessages, type Locale } from "@/lib/i18n";
import { pointerAway, pointerOnto } from "@/test/pointer";
import { HealthToggleCards } from "./health-cards";
import {
  CHECK_DELAY,
  DRAW_END,
  LEAVE,
  LEAVE_TIP,
  PREVIEW_TIP,
  READ_AT,
  READ_END,
  TEST_TUBE,
  TILT_PEAK,
  tubeTracks,
} from "./health-glyphs";

// Motion reads the media query once per module and keeps the answer, so a
// matchMedia stub installed in one test never reaches it. The hook is the seam.
const motion = vi.hoisted(() => ({ reduced: false }));
vi.mock("motion/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("motion/react")>()),
  useReducedMotion: () => motion.reduced,
}));

afterEach(() => cleanup());

const tests = (locale: Locale = "sl") =>
  TOGGLES.filter(({ key }) => FILTER_TOGGLE_KEYS.includes(key)).map(
    (toggle) => ({ ...toggle, label: toggleLabel(toggle.key, locale) }),
  );

const counts = new Map([
  ["brez-fiv", 227],
  ["brez-felv", 236],
]);

function renderCards(
  overrides: {
    locale?: Locale;
    counts?: Map<string, number>;
    selected?: ToggleKey[];
    layout?: "sidebar" | "sheet";
    onToggle?: (key: ToggleKey) => void;
    onToggleMany?: (keys: ToggleKey[]) => void;
  } = {},
) {
  const onToggle = overrides.onToggle ?? vi.fn();
  const onToggleMany = overrides.onToggleMany ?? vi.fn();
  const locale = overrides.locale ?? "sl";
  render(
    <I18nProvider locale={locale}>
      <HealthToggleCards
        toggles={tests(locale)}
        counts={overrides.counts ?? counts}
        selected={overrides.selected ?? []}
        onToggle={onToggle}
        onToggleMany={onToggleMany}
        layout={overrides.layout}
      />
    </I18nProvider>,
  );
  return { onToggle, onToggleMany };
}

/** A test's row, found by the label its accessible name starts with. */
const row = (label: string) =>
  screen.getByRole("button", { name: new RegExp(`^${label}, `) });

/** Every outline a subtree draws, in the order it draws them. */
const pathData = (root: Element) =>
  [...root.querySelectorAll("path")].map((path) => path.getAttribute("d"));

describe("HealthToggleCards", () => {
  it("says what FIV and FeLV are, drawn above the rows and not in a tooltip", () => {
    renderCards();

    expect(screen.getByRole("heading", { name: "Zdravje" })).toBeTruthy();
    const lead = screen.getByText("FIV je mačji aids, FeLV mačja levkemija.");
    // Not the hint's dress, which a folding section hides on a fine pointer.
    expect(lead.className).not.toContain("hidden");
  });

  it("says it in English too", () => {
    renderCards({ locale: "en" });
    expect(
      screen.getByText("FIV is feline AIDS, FeLV feline leukemia."),
    ).toBeTruthy();
  });

  // Why: the comment on healthLead in lib/i18n.ts.
  it.each(["sl", "en"] as const)(
    "lets the %s lead break only between its two halves",
    (locale) => {
      const halves = getMessages(locale).healthLead.split(" ");
      expect(halves).toHaveLength(2);
      expect(halves[0].endsWith(",")).toBe(true);
    },
  );

  it("renders one row per test with its label, count and aria-label", () => {
    renderCards();

    for (const { key, label } of tests()) {
      expect(row(label).textContent).toContain(label);
      expect(row(label).textContent).toContain(String(counts.get(key)));
    }
  });

  it("reflects the selection through aria-pressed and toggles the test's key", () => {
    const { onToggle } = renderCards({ selected: ["brez-felv"] });

    expect(row("Brez FIV").getAttribute("aria-pressed")).toBe("false");
    expect(row("Brez FeLV").getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(row("Brez FIV"));
    expect(onToggle).toHaveBeenLastCalledWith("brez-fiv");
    fireEvent.click(row("Brez FeLV"));
    expect(onToggle).toHaveBeenLastCalledWith("brez-felv");
  });

  it("clears the section from its reset", () => {
    const { onToggleMany } = renderCards({
      selected: ["brez-fiv", "brez-felv"],
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Ponastavi zdravstvene filtre" }),
    );
    expect(onToggleMany).toHaveBeenCalledWith(["brez-fiv", "brez-felv"]);
  });

  it("locks out a test no cat has a result for, and lays its tube down", () => {
    renderCards({
      layout: "sheet",
      counts: new Map([
        ["brez-fiv", 0],
        ["brez-felv", 4],
      ]),
    });

    const dead = row("Brez FIV") as HTMLButtonElement;
    const live = row("Brez FeLV") as HTMLButtonElement;
    expect(dead.disabled).toBe(true);
    expect(live.disabled).toBe(false);
    const posture = (card: Element) =>
      card.querySelector("svg[data-health-glyph]")?.getAttribute("class") ?? "";
    expect(posture(dead)).toMatch(/rotate-\[\d+deg\]/);
    expect(posture(dead)).toContain("opacity-60");
    expect(posture(live)).not.toMatch(/rotate-\[\d+deg\]/);
    expect(posture(live)).not.toContain("opacity-60");
  });

  it("never locks out a picked test", () => {
    renderCards({
      counts: new Map([
        ["brez-fiv", 0],
        ["brez-felv", 0],
      ]),
      selected: ["brez-fiv"],
    });

    expect((row("Brez FIV") as HTMLButtonElement).disabled).toBe(false);
  });
});

describe("the tube", () => {
  it("is lucide's test tube in both rows and on every other surface, and carries no tick", () => {
    // The drawing is copied into health-glyphs.tsx so it can be inked in. A
    // lucide upgrade that redraws the tube has to fail here rather than leave
    // the panel drawing one tube and the chip, the dialog's pill and the
    // poster's tile another.
    const lucide = render(<TestTubeDiagonal />);
    const drawn = pathData(lucide.container);
    cleanup();

    expect(drawn.length).toBeGreaterThan(0);
    expect(Object.values(TEST_TUBE)).toEqual(drawn);
    for (const key of FILTER_TOGGLE_KEYS) {
      expect(HEALTH_ICONS[key]).toBe(TestTubeDiagonal);
    }

    renderCards();
    for (const { label } of tests()) {
      const glyph = row(label).querySelector("svg[data-health-glyph]");
      expect(glyph).not.toBeNull();
      const ink = glyph?.querySelector("[data-ink]");
      // The muted outline and the accent copy are the same three strokes,
      // and nothing else is drawn: no tick at rest or when picked.
      expect(pathData(glyph as Element)).toEqual([...drawn, ...drawn]);
      expect(pathData(ink as Element)).toEqual(drawn);
    }
  });

  it("leaves the three retired traits their own marks", () => {
    // Sterilizacija, Cepljenje and Čip are off the panel, and the dialog and
    // the poster still name them.
    expect(HEALTH_ICONS.sterilizacija).toBe(Scissors);
    expect(HEALTH_ICONS.cepljenje).toBe(Syringe);
    expect(HEALTH_ICONS.cip).toBe(ScanLine);
  });
});

describe("tubeTracks", () => {
  const state = {
    checked: true,
    reading: false,
    previewing: false,
    reduced: false,
    resetDelay: 0,
  };
  type Timed = { duration: number; delay?: number; times?: number[]; type?: string };

  it("draws the sample in last and has the whole drawing in by 0.2s", () => {
    const { strokes } = tubeTracks(state);
    const at = (name: keyof typeof strokes) =>
      (strokes[name].transition as { pathLength: Timed }).pathLength;

    expect(at("sample").delay).toBeGreaterThan(at("glass").delay ?? 0);
    expect(at("sample").delay).toBeGreaterThanOrEqual(at("rim").delay ?? 0);
    expect(DRAW_END).toBeCloseTo(0.2);
    for (const name of ["glass", "rim", "sample"] as const) {
      // A stroke waiting for its turn is switched off rather than left as the
      // dot a round cap paints at pathLength 0; opacity switches it on when
      // the draw starts.
      const { opacity } = strokes[name].transition as { opacity: Timed };
      expect(opacity.delay).toBe(at(name).delay);
      expect(strokes[name].animate).toEqual({ pathLength: 1, opacity: 1 });
    }
  });

  it("raises the tube once towards upright to be read, on a tween with the wait in its keyframes", () => {
    const { tilt } = tubeTracks({ ...state, reading: true });
    const rotate = tilt.animate.rotate as (number | null)[];
    const transition = tilt.transition as Timed;

    // From wherever the tube is, then level, up once, a small swing back past
    // level, and still.
    expect(rotate[0]).toBeNull();
    expect(rotate.at(-1)).toBe(0);
    expect(Math.min(...rotate.filter((value) => value !== null))).toBe(TILT_PEAK);
    expect(TILT_PEAK).toBeLessThan(0);
    expect(transition).not.toHaveProperty("delay");
    expect(transition.type).toBeUndefined();
    expect(transition.duration).toBeCloseTo(READ_END);
    // Read once the sample is in.
    expect(READ_AT).toBeGreaterThan(DRAW_END);
  });

  // A test ticked again while its accent is still leaving comes back from
  // where the leave left it, rather than jumping to full in one frame.
  it("switches the accent back on over a few frames, not in one", () => {
    const { ink } = tubeTracks(state);
    const { duration } = ink.transition as Timed;

    expect(ink.animate).toEqual({ opacity: 1, rotate: 0 });
    expect(duration).toBeGreaterThan(0);
    expect(duration).toBeLessThanOrEqual(0.1);
  });

  it("holds the tube level when the pick is not playing", () => {
    for (const checked of [true, false]) {
      const { tilt } = tubeTracks({ ...state, checked });
      expect(tilt.animate).toEqual({ rotate: 0 });
    }
  });

  // The tapped card fills at once and its box waits for CHECK_DELAY.
  it("ticks the box once the sample is in and before the tube is at its highest", () => {
    expect(CHECK_DELAY).toBeGreaterThanOrEqual(0.2);
    expect(CHECK_DELAY).toBeLessThanOrEqual(0.3);
    expect(CHECK_DELAY).toBeGreaterThanOrEqual(DRAW_END);
    expect(CHECK_DELAY).toBeLessThanOrEqual(READ_AT);
  });

  it("lays the accent aside on the way out, in the row's turn, and never runs the draw backwards", () => {
    const { ink, strokes, tilt } = tubeTracks({
      ...state,
      checked: false,
      resetDelay: 0.045,
    });

    // Towards lying down, the way a dead test's tube lies.
    expect(ink.animate).toEqual({ opacity: 0, rotate: LEAVE_TIP });
    expect(LEAVE_TIP).toBeGreaterThan(0);
    expect(ink.transition).toMatchObject({ duration: LEAVE, delay: 0.045 });
    for (const stroke of Object.values(strokes)) {
      expect(stroke.animate).toEqual({ pathLength: 0, opacity: 0 });
      expect(stroke.transition).toMatchObject({ duration: 0 });
      expect((stroke.transition as Timed).delay).toBeCloseTo(0.045 + LEAVE);
    }
    expect(tilt.animate).toEqual({ rotate: 0 });
  });

  it("tips a third of the way towards the read under a pointer, and only then", () => {
    expect(PREVIEW_TIP).toBeCloseTo(TILT_PEAK / 3);
    expect(
      tubeTracks({ ...state, checked: false, previewing: true }).preview.animate,
    ).toEqual({ rotate: PREVIEW_TIP });
    expect(
      tubeTracks({ ...state, checked: false }).preview.animate,
    ).toEqual({ rotate: 0 });
  });

  it.each([true, false])("lands every part at once under reduced motion (checked: %s)", (checked) => {
    const tracks = tubeTracks({
      checked,
      reading: checked,
      previewing: !checked,
      reduced: true,
      resetDelay: 0.09,
    });
    const shown = checked ? 1 : 0;
    const all = [tracks.preview, tracks.tilt, tracks.ink, ...Object.values(tracks.strokes)];
    for (const track of all) {
      expect(track.transition).toEqual({ duration: 0 });
      for (const value of Object.values(track.animate)) {
        expect(Array.isArray(value)).toBe(false);
      }
    }
    expect(tracks.tilt.animate).toEqual({ rotate: 0 });
    expect(tracks.preview.animate).toEqual({ rotate: 0 });
    expect(tracks.ink.animate).toEqual({ opacity: shown, rotate: 0 });
    for (const stroke of Object.values(tracks.strokes)) {
      expect(stroke.animate).toEqual({ pathLength: shown, opacity: shown });
    }
  });
});

describe("HealthToggleCards under the pointer", () => {
  const tipped = (label: string) =>
    row(label).querySelector("[data-tipped]") !== null;

  it("tips the tube under a mouse and not under a finger", () => {
    renderCards();

    pointerOnto(row("Brez FIV"), "touch");
    expect(tipped("Brez FIV")).toBe(false);

    pointerOnto(row("Brez FIV"), "mouse");
    expect(tipped("Brez FIV")).toBe(true);
  });

  // Why: the comment on settle in health-cards.tsx.
  it("keeps the tube level from a click until the pointer comes back", async () => {
    function Stateful() {
      const [selected, setSelected] = useState<ToggleKey[]>(["brez-fiv"]);
      return (
        <I18nProvider locale="sl">
          <HealthToggleCards
            toggles={tests()}
            counts={counts}
            selected={selected}
            onToggle={(key) =>
              setSelected((current) =>
                current.includes(key)
                  ? current.filter((entry) => entry !== key)
                  : [...current, key],
              )
            }
            onToggleMany={() => undefined}
          />
        </I18nProvider>
      );
    }
    render(<Stateful />);

    // A picked test has nothing to preview.
    pointerOnto(row("Brez FIV"), "mouse");
    expect(tipped("Brez FIV")).toBe(false);

    // Unticked under the mouse, it stays level.
    fireEvent.click(row("Brez FIV"));
    await waitFor(() =>
      expect(row("Brez FIV").getAttribute("aria-pressed")).toBe("false"),
    );
    expect(tipped("Brez FIV")).toBe(false);

    await pointerAway(row("Brez FIV"));
    pointerOnto(row("Brez FIV"), "mouse");
    expect(tipped("Brez FIV")).toBe(true);
  });

  it("does not tip a test with nothing to pick", () => {
    renderCards({ layout: "sheet", counts: new Map([["brez-fiv", 0]]) });

    pointerOnto(row("Brez FIV"), "mouse");
    expect(tipped("Brez FIV")).toBe(false);
  });

  // The one place the pick, the untick, the hover and the reset actually run:
  // a keyframe array reaching a spring would throw here rather than in review.
  it("plays a pick, an untick, a hover and a reset without a motion error", () => {
    function Stateful() {
      const [selected, setSelected] = useState<ToggleKey[]>([]);
      return (
        <I18nProvider locale="sl">
          <HealthToggleCards
            toggles={tests()}
            counts={counts}
            selected={selected}
            onToggle={(key) =>
              setSelected((current) =>
                current.includes(key)
                  ? current.filter((entry) => entry !== key)
                  : [...current, key],
              )
            }
            onToggleMany={(keys) =>
              setSelected((current) =>
                current.filter((entry) => !keys.includes(entry)),
              )
            }
          />
        </I18nProvider>
      );
    }
    render(<Stateful />);

    for (const { label } of tests()) {
      pointerOnto(row(label), "mouse");
      fireEvent.click(row(label));
      expect(row(label).getAttribute("aria-pressed")).toBe("true");
    }
    fireEvent.click(row("Brez FIV"));
    expect(row("Brez FIV").getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(row("Brez FIV"));
    fireEvent.click(
      screen.getByRole("button", { name: "Ponastavi zdravstvene filtre" }),
    );
    for (const { label } of tests()) {
      expect(row(label).getAttribute("aria-pressed")).toBe("false");
    }
  });

  // The ring that leaves the tube on a pick; the tick box is the other
  // bordered mark in a row and is square.
  const ring = (label: string) =>
    row(label).querySelector("span.rounded-full.border-brand-strong");

  function StatefulCards() {
    const [selected, setSelected] = useState<ToggleKey[]>([]);
    return (
      <I18nProvider locale="sl">
        <HealthToggleCards
          toggles={tests()}
          counts={counts}
          selected={selected}
          onToggle={(key) => setSelected((current) => [...current, key])}
          onToggleMany={() => undefined}
        />
      </I18nProvider>
    );
  }

  it("sends a ring off the tube on a pick", () => {
    render(<StatefulCards />);

    fireEvent.click(row("Brez FeLV"));
    expect(row("Brez FeLV").getAttribute("aria-pressed")).toBe("true");
    expect(ring("Brez FeLV")).not.toBeNull();
  });

  it("neither tips nor rings under reduced motion, and still toggles", () => {
    motion.reduced = true;
    try {
      render(<StatefulCards />);

      pointerOnto(row("Brez FeLV"), "mouse");
      expect(tipped("Brez FeLV")).toBe(false);
      fireEvent.click(row("Brez FeLV"));
      expect(row("Brez FeLV").getAttribute("aria-pressed")).toBe("true");
      expect(ring("Brez FeLV")).toBeNull();
    } finally {
      motion.reduced = false;
    }
  });
});
