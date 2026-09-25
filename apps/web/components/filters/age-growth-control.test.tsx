// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/components/i18n-provider";
import { groupOptions } from "@/lib/filters";
import { pointer, pointerOff, pointerOnto } from "@/test/pointer";
import {
  AgeGrowthControl,
  groundSink,
  isAgeStageActive,
  plantMotion,
  rowPlantPose,
  type PlantCue,
} from "./age-growth-control";
import { agePathTransition } from "./age-stage-icon";
import { AGE_STAGE_PATHS, type AgeStage } from "./age-stage-paths";

const options = groupOptions("age", [], "sl");
const counts = new Map(options.map(({ value }) => [value, 3]));
const STAGES: AgeStage[] = ["mladicek", "odrasel", "senior"];

afterEach(cleanup);

function ageControl(
  selected: string[] = [],
  layout: "sidebar" | "sheet" = "sidebar",
  onToggle: (value: string) => void = () => undefined,
  stageCounts: Map<string, number> = counts,
) {
  return (
    <I18nProvider locale="sl">
      <AgeGrowthControl
        options={options}
        counts={stageCounts}
        selected={selected}
        onToggle={onToggle}
        onToggleMany={() => undefined}
        layout={layout}
      />
    </I18nProvider>
  );
}

function renderAgeControl(
  selected: string[] = [],
  layout: "sidebar" | "sheet" = "sidebar",
): string {
  return renderToStaticMarkup(ageControl(selected, layout));
}

// The control with its selection in state, the way the page holds it, so a
// pick lands and a reset empties it.
function StatefulAgeControl({ initial = [] }: { initial?: string[] }) {
  const [selected, setSelected] = useState(initial);
  return (
    <I18nProvider locale="sl">
      <AgeGrowthControl
        options={options}
        counts={counts}
        selected={selected}
        onToggle={(value) =>
          setSelected((current) =>
            current.includes(value)
              ? current.filter((item) => item !== value)
              : [...current, value],
          )
        }
        onToggleMany={(values) =>
          setSelected((current) =>
            current.filter((item) => !values.includes(item)),
          )
        }
      />
    </I18nProvider>
  );
}

function grove(container: HTMLElement): HTMLElement {
  const element = container.querySelector<HTMLElement>(
    '[data-age-view="grove"]',
  );
  if (!element) throw new Error("no grove");
  return element;
}

// A row's or a tile's plant, as opposed to the grove's.
function rowPlant(container: HTMLElement, stage: AgeStage): SVGElement {
  const icon = container.querySelector<SVGElement>(
    `button [data-age-icon="${stage}"]`,
  );
  if (!icon) throw new Error(`no row plant for ${stage}`);
  return icon;
}

/**
 * The rendered stage buttons, each as its own opening tag, matched on
 * aria-pressed, which every toggle group item carries.
 */
function stageTags(html: string): string[] {
  return html.match(/<button[^>]*aria-pressed="[^"]*"[^>]*>/g) ?? [];
}

// Where a path's pen goes down, from its leading M command.
function startOf(d: string): { x: number; y: number } {
  const [x, y] = d
    .replace(/^M\s*/, "")
    .split(/[\s,a-zA-Z]+/)
    .map(Number);
  return { x, y };
}

describe("AgeGrowthControl", () => {
  it("treats the empty filter as all age stages active", () => {
    const html = renderAgeControl();

    expect(html.match(/data-stage-active="true"/g)).toHaveLength(3);
    expect(html).not.toContain('data-stage-active="false"');
  });

  it("mutes only stages excluded by an explicit selection", () => {
    const html = renderAgeControl(["odrasel"]);

    expect(html.match(/data-stage-active="true"/g)).toHaveLength(1);
    expect(html.match(/data-stage-active="false"/g)).toHaveLength(2);
  });

  it("keeps the decorative lifecycle out of the accessibility tree", () => {
    const html = renderAgeControl();

    expect(html).toContain('aria-hidden="true" data-age-view="grove"');
    expect(html).toContain('aria-label="Starost"');
    expect(html).toContain("mladič do 1 leta, odrasla žival od 1 do manj kot 8 let");
  });

  // inert is what takes it out of the tab order, not a tabIndex={-1} written
  // beside the aria-hidden: one attribute for both halves, which is the only
  // spelling that cannot come apart from itself (filter-section-header.tsx).
  it("keeps the reset action stable but unreachable until a filter is selected", () => {
    const inactiveHtml = renderAgeControl();
    const activeHtml = renderAgeControl(["odrasel"]);

    expect(inactiveHtml).toContain('aria-hidden="true"');
    expect(inactiveHtml).toMatch(
      /inert="" aria-hidden="true" aria-label="Ponastavi filter starosti"/,
    );
    expect(activeHtml).toContain('aria-hidden="false"');
    expect(activeHtml).not.toContain("inert=");
    expect(activeHtml).not.toContain('tabindex="-1"');
  });
});

describe("AgeGrowthControl grove", () => {
  // The ranges were a hover tooltip, which a phone never opens.
  it("prints each stage's range under its plant", () => {
    const { container } = render(ageControl());

    expect(
      [...grove(container).querySelectorAll("[data-age-stage]")].map(
        (column) => column.textContent,
      ),
    ).toEqual(["do 1 leta", "1–8 let", "8 let ali več"]);
  });

  it("presses a stage when its plant is clicked", () => {
    const onToggle = vi.fn();
    const { container } = render(ageControl([], "sidebar", onToggle));

    const senior = grove(container).querySelector<HTMLElement>(
      '[data-age-stage="senior"]',
    );
    fireEvent.click(senior!);

    expect(onToggle).toHaveBeenCalledWith("senior");
  });

  it("leaves a plant alone whose row is dead", () => {
    const onToggle = vi.fn();
    const { container } = render(
      ageControl(
        [],
        "sidebar",
        onToggle,
        new Map([
          ["mladicek", 3],
          ["odrasel", 3],
          ["senior", 0],
        ]),
      ),
    );

    fireEvent.click(
      grove(container).querySelector<HTMLElement>('[data-age-stage="senior"]')!,
    );

    expect(onToggle).not.toHaveBeenCalled();
  });

  // The grove is aria-hidden, so anything in it that took focus would be a
  // stop that announces nothing (e2e/reach.ts sweeps for exactly that).
  it("adds no tab stop and no control for a screen reader", () => {
    const { container } = render(ageControl());
    const element = grove(container);

    expect(element.querySelector("button, a, [tabindex]")).toBeNull();
    for (const column of element.querySelectorAll<HTMLElement>(
      "[data-age-stage]",
    )) {
      expect(column.tabIndex).toBe(-1);
    }
  });

  it("stands the sprout on the grove's ground rather than its own soil", () => {
    const { container } = render(ageControl());

    const groveSprout = grove(container).querySelectorAll(
      '[data-age-icon="mladicek"] path',
    );
    const rowSprout = container.querySelectorAll(
      'button [data-age-icon="mladicek"] path',
    );
    expect(groveSprout).toHaveLength(AGE_STAGE_PATHS.mladicek.length - 1);
    expect(rowSprout).toHaveLength(AGE_STAGE_PATHS.mladicek.length);
  });

  it("lowers every plant onto its ground line and no further than its box", () => {
    for (const stage of STAGES) {
      expect(groundSink(stage)).toBeGreaterThan(0);
      expect(groundSink(stage)).toBeLessThan(4);
    }
  });

  it("draws trunks in wood and canopies in leaf", () => {
    const { container } = render(ageControl());
    const tree = grove(container).querySelector('[data-age-icon="senior"]');

    expect(tree?.getAttribute("class")).toContain("text-grove-leaf");
    expect(
      [...(tree?.querySelectorAll("path") ?? [])].map((path) =>
        path.getAttribute("class"),
      ),
    ).toEqual(["text-grove-wood", null, null]);
  });
});

describe("plantMotion", () => {
  const cue = (overrides: Partial<PlantCue>): PlantCue => ({
    stage: "mladicek",
    index: 0,
    lastIndex: 2,
    reduceMotion: false,
    growing: false,
    leaving: false,
    farewellWait: 0,
    gusting: false,
    grown: null,
    ...overrides,
  });
  type Track = { duration: number; times: number[]; ease: string[] };
  // The keyframes a pose writes, the first of which may be null: wherever the
  // plant is when the pose begins.
  const keyframes = (values: unknown) => values as (number | null)[];
  const numbers = (values: unknown) =>
    keyframes(values).filter((value): value is number => value !== null);
  const peak = (values: unknown) => Math.max(...numbers(values));
  const rotateTrack = (transition: unknown) =>
    (transition as { rotate: Track }).rotate;
  // Seconds from the pose's start to the keyframe at `index` of its rotation.
  const rotateAt = (transition: unknown, index: number) => {
    const { times, duration } = rotateTrack(transition);
    return times[index] * duration;
  };

  // Each stage says goodbye in its own register rather than all fading alike.
  it("wilts an unpicked sprout and shivers an unpicked shrub", () => {
    const sprout = plantMotion(cue({ leaving: true })).animate;
    const shrub = plantMotion(
      cue({ stage: "odrasel", index: 1, leaving: true }),
    ).animate;

    expect(Math.min(...numbers(sprout.scaleY))).toBeLessThan(0.95);
    // A shiver goes both ways, several times, and never far.
    const turns = numbers(shrub.rotate);
    expect(turns.filter((degrees) => degrees < 0).length).toBeGreaterThan(1);
    expect(turns.filter((degrees) => degrees > 0).length).toBeGreaterThan(1);
    expect(peak(turns.map(Math.abs))).toBeLessThan(2);
  });

  it("blows a reset's gust through the grove from the left", () => {
    const moves = (["mladicek", "odrasel", "senior"] as const).map(
      (stage, index) => plantMotion(cue({ stage, index, gusting: true })),
    );
    const bends = moves.map(({ animate }) => peak(animate.rotate));
    const bentAt = moves.map(({ animate, transition }) => {
      const rotate = keyframes(animate.rotate);
      return rotateAt(transition, rotate.indexOf(peak(rotate)));
    });

    // Every plant bends the same way, downwind, one after another.
    expect(bentAt).toEqual([...bentAt].sort((a, b) => a - b));
    expect(new Set(bentAt).size).toBe(3);
    expect(bends.every((degrees) => degrees > 0)).toBe(true);
    // The sprout bends furthest and the tree least.
    expect(bends).toEqual([...bends].sort((a, b) => b - a));
    // From wherever each plant is: any gesture can cut another short.
    for (const { animate } of moves) {
      expect(keyframes(animate.rotate)[0]).toBeNull();
    }
  });

  // The sway's first pair of keyframes holds still until the plant has grown
  // enough to be pushed, and that hold is where a moving plant comes upright.
  it("comes upright over the sway's own hold when it is picked", () => {
    for (const [index, stage] of STAGES.entries()) {
      const { animate, transition } = plantMotion(
        cue({ stage, index, growing: true }),
      );
      const [from, held] = keyframes(animate.rotate);
      expect(from).toBeNull();
      expect(held).toBeCloseTo(0);
      expect(rotateAt(transition, 1)).toBeGreaterThan(0.2);
    }

    const { animate, transition } = plantMotion(cue({ growing: true }));
    const { duration, times } = rotateTrack(transition);
    expect(animate.rotate).toEqual([null, 0, 9, -6, 3, 0]);
    expect(duration).toBeCloseTo(0.66);
    [0, 0.34, 0.52, 0.7, 0.86, 1].forEach((time, index) =>
      expect(times[index]).toBeCloseTo(time),
    );
  });

  it("lets a neighbour come upright over the whole wait before it leans", () => {
    const { animate, transition } = plantMotion(
      cue({
        stage: "odrasel",
        index: 1,
        grown: { stage: "mladicek", index: 0 },
      }),
    );
    // The sprout's first push, one column over.
    const wait = 0.34 * 0.66 + 0.06;

    expect(animate.rotate).toEqual([null, 0, 0, 2.2, 0]);
    expect(rotateAt(transition, 1)).toBeCloseTo(wait);
    expect(rotateAt(transition, 2)).toBeCloseTo(wait);
    expect(rotateTrack(transition).duration).toBeCloseTo(wait + 0.42);
    expect(rotateTrack(transition).ease[0]).toBe("easeIn");
  });

  // Why: the gust branch of plantMotion.
  it("carries each plant into the gust from where it is, or upright first when its turn allows", () => {
    const [first, second, third] = STAGES.map((stage, index) =>
      plantMotion(cue({ stage, index, gusting: true })),
    );

    // No turn to wait for: the gust's first push takes it from where it is.
    expect(first.animate.rotate).toHaveLength(5);
    expect(rotateAt(first.transition, 1)).toBeCloseTo(0.3 * 0.7);
    // One stagger: it holds where it is, then the gust takes it.
    expect(keyframes(second.animate.rotate).slice(0, 3)).toEqual([
      null, null, 6,
    ]);
    expect(rotateAt(second.transition, 1)).toBeCloseTo(0.09);
    // Two: upright over the whole turn, on a linear settle.
    expect(keyframes(third.animate.rotate).slice(0, 3)).toEqual([
      null, 0, 0,
    ]);
    expect(rotateAt(third.transition, 1)).toBeCloseTo(0.18);
    expect(rotateAt(third.transition, 2)).toBeCloseTo(0.18);
    expect(rotateTrack(third.transition).ease[0]).toBe("linear");
  });

  it("says goodbye on the click, or once a plant still moving is upright", () => {
    const still = plantMotion(cue({ leaving: true }));
    const moving = plantMotion(cue({ leaving: true, farewellWait: 0.24 }));

    // Same clock as the leaves' fold (AGE_WILT).
    expect(still.animate.rotate).toEqual([null, 7, 5, 0]);
    expect(rotateTrack(still.transition)).toMatchObject({
      duration: 0.8,
      times: [0, 0.3, 0.55, 1],
    });
    expect(moving.animate.rotate).toEqual([null, 0, 0, 7, 5, 0]);
    expect(moving.animate.scaleY).toEqual([null, 1, 1, 0.88, 0.91, 1]);
    expect(rotateAt(moving.transition, 2)).toBeCloseTo(0.24);
    expect(rotateTrack(moving.transition).duration).toBeCloseTo(1.04);
  });

  it("lets a pick outrank a gust and a gust outrank a farewell", () => {
    const picked = plantMotion(
      cue({ growing: true, gusting: true, leaving: true }),
    );
    const gusted = plantMotion(cue({ gusting: true, leaving: true }));

    expect(picked.animate.scaleY).toEqual(expect.any(Array));
    expect(gusted.animate.scaleY).toBe(1);
  });

  it("leaves every plant at rest when reduced motion is requested", () => {
    for (const overrides of [
      { growing: true },
      { leaving: true },
      { gusting: true },
      { grown: { stage: "senior" as const, index: 2 } },
    ]) {
      const { animate, transition } = plantMotion(
        cue({ ...overrides, reduceMotion: true }),
      );
      expect(animate).toEqual({ rotate: 0, x: 0, scaleX: 1, scaleY: 1 });
      expect(transition).toEqual({ duration: 0 });
    }
  });
});

describe("AgeGrowthControl keyboard model", () => {
  // Half the panel's sections are plain buttons, where Tab stops on every
  // option. Radix's roving focus would make this group one stop that arrow
  // keys move inside, so the same panel would answer Tab in two ways.
  it("makes every stage its own tab stop", () => {
    const tags = stageTags(renderAgeControl());

    expect(tags).toHaveLength(3);
    for (const tag of tags) {
      expect(tag).not.toContain('tabindex="-1"');
    }
  });
});

describe("AgeGrowthControl sidebar row", () => {
  // toggleVariants spells the tile's border and shadow against aria-pressed
  // and data-state both. A chosen row that answered only one of them came out
  // brand-bordered over a shadow, which is the tile.
  it("keeps the tile's surface off a chosen row", () => {
    const [tag] = stageTags(renderAgeControl(["odrasel"])).filter((candidate) =>
      candidate.includes('aria-pressed="true"'),
    );

    expect(tag).toBeDefined();
    const classes = (tag.match(/class="([^"]*)"/)?.[1] ?? "").split(" ");
    expect(classes).not.toContain("shadow-xs");
    expect(classes).not.toContain("aria-pressed:shadow-xs");
    expect(classes).not.toContain("aria-pressed:border-brand-border");
    expect(classes).toContain("aria-pressed:bg-brand");
    expect(classes).toContain("h-10");
  });
});

describe("AgeGrowthControl sheet tiles", () => {
  // The drawer prints every other section's label at 12px over an 11px count.
  // Starost printed 11 over 10, which read as one section set smaller than
  // the ones above and below it.
  it("sets its sheet tile in the drawer's shared sizes", () => {
    const html = renderAgeControl([], "sheet");

    const label = html.match(/<span class="([^"]*)">Mladiček<\/span>/);
    expect(label?.[1]).toContain("text-xs");
    expect(label?.[1]).not.toContain("text-2xs");
    // The count is the only thing that was 10px, so this says it moved.
    expect(html).not.toContain("text-3xs");
    expect(html).toContain("text-2xs");
  });
});

describe("AgeGrowthControl row plants", () => {
  // The canopy's colour, which is the svg's own, and each trunk's.
  function inks(icon: SVGElement, stage: AgeStage) {
    return {
      canopy: icon.getAttribute("class") ?? "",
      wood: [...icon.querySelectorAll("path")]
        .filter((_, index) => AGE_STAGE_PATHS[stage][index].wood)
        .map((path) => path.getAttribute("class") ?? ""),
    };
  }

  // Green means chosen across the panel. The rows wore the grove's colours
  // at rest and kept them through a pick, where every other row's icon is
  // grey until it is chosen.
  it("rests every row's plant in the muted ink and colours only the chosen one", () => {
    const { container } = render(ageControl(["odrasel"]));

    for (const stage of STAGES) {
      const { canopy, wood } = inks(rowPlant(container, stage), stage);
      if (stage === "odrasel") {
        expect(canopy).toContain("text-grove-leaf");
        for (const trunk of wood) expect(trunk).toContain("text-grove-wood");
      } else {
        expect(canopy).toContain("text-muted-foreground");
        expect(canopy).not.toContain("text-grove");
        for (const trunk of wood) {
          expect(trunk).toContain("text-muted-foreground");
          expect(trunk).not.toContain("text-grove");
        }
      }
    }
    // A shrub and a tree have trunks, so both kinds of path were checked.
    expect(inks(rowPlant(container, "odrasel"), "odrasel").wood).toHaveLength(2);
    expect(inks(rowPlant(container, "senior"), "senior").wood).toHaveLength(1);
  });

  it("leaves a dead stage's plant grey", () => {
    const { container } = render(
      ageControl(
        [],
        "sidebar",
        undefined,
        new Map([
          ["mladicek", 0],
          ["odrasel", 3],
          ["senior", 3],
        ]),
      ),
    );

    expect(rowPlant(container, "mladicek").getAttribute("class")).toContain(
      "text-muted-foreground",
    );
  });

  it("keeps the grove's colours whatever is picked", () => {
    for (const selected of [[], ["odrasel"], ["mladicek", "senior"]]) {
      const { container } = render(ageControl(selected));
      const plants = grove(container).querySelectorAll("[data-age-icon]");
      expect(plants).toHaveLength(3);
      for (const plant of plants) {
        expect(plant.getAttribute("class")).toContain("text-grove-leaf");
      }
      cleanup();
    }
  });

  it("lights a chosen row's icon well, and leaves the tile without one", () => {
    const { container } = render(ageControl(["senior"]));
    const halo = (stage: AgeStage) =>
      rowPlant(container, stage)
        .closest("span.grid")
        ?.querySelector<HTMLElement>("span.rounded-full");

    expect(halo("senior")?.style.opacity).toBe("1");
    expect(halo("odrasel")?.style.opacity).toBe("0");

    const sheet = render(ageControl(["senior"], "sheet"));
    expect(sheet.container.querySelector("button span.rounded-full")).toBeNull();
  });

  // Why: the reset stagger has to reach the glyph, not just its halo.
  it("gives the colour back in each row's turn on a reset", () => {
    const { container } = render(
      <StatefulAgeControl initial={["mladicek", "odrasel", "senior"]} />,
    );
    for (const stage of STAGES) {
      expect(rowPlant(container, stage).getAttribute("class")).toContain(
        "text-grove-leaf",
      );
    }

    fireEvent.click(
      screen.getByRole("button", { name: "Ponastavi filter starosti" }),
    );

    expect(
      STAGES.map((stage) => rowPlant(container, stage).style.transitionDelay),
    ).toEqual(["", "0.045s", "0.09s"]);
    for (const stage of STAGES) {
      expect(rowPlant(container, stage).getAttribute("class")).toContain(
        "text-muted-foreground",
      );
    }
    // The trunk has a colour class of its own, so it takes the svg's turn.
    for (const trunk of inks(rowPlant(container, "senior"), "senior").wood) {
      expect(trunk).toContain("delay-[inherit]");
    }
  });

  // The stages left out used to drop their captions to half opacity:
  // 2.08:1 light and 2.68:1 dark at 11px.
  it("keeps every range caption in full ink after a pick", () => {
    const { container } = render(ageControl(["odrasel"]));
    const captions = [
      ...grove(container).querySelectorAll("[data-age-stage] > span:last-child"),
    ];

    expect(captions.map((caption) => caption.textContent)).toEqual([
      "do 1 leta",
      "1–8 let",
      "8 let ali več",
    ]);
    for (const caption of captions) {
      const classes = (caption.getAttribute("class") ?? "").split(" ");
      expect(classes).toContain("text-muted-foreground");
      expect(classes.filter((name) => /(^|:)opacity-/.test(name))).toEqual([]);
      // 12px in the phone's sheet, 11px in the sidebar.
      expect(classes).toContain("text-xs");
      expect(classes).toContain("lg:text-2xs");
    }
  });

  // The tiles centred plants of 20, 22 and 24px, which set their labels at
  // 34, 35 and 36px and their counts a pixel apart the same way.
  it("stands every tile's plant on the floor of one slot as tall as the tallest", () => {
    const { container } = render(ageControl([], "sheet"));
    const slots = STAGES.map((stage) => {
      const plant = rowPlant(container, stage);
      return [...(plant.closest("button")?.children ?? [])].find((child) =>
        child.contains(plant),
      );
    });
    const classes = slots.map((slot) => slot?.getAttribute("class") ?? "");

    expect(new Set(classes).size).toBe(1);
    expect(classes[0].split(" ")).toEqual(
      expect.arrayContaining(["h-6", "items-end"]),
    );
    // h-6 is the tree's own size-6, the tallest of the three.
    expect(rowPlant(container, "senior").getAttribute("class")).toContain(
      "size-6",
    );
  });
});

describe("AgeGrowthControl row gestures", () => {
  const row = (name: string) =>
    screen.getByRole("button", { name: new RegExp(`^${name}, `) });
  const leaning = (name: string) =>
    row(name).querySelector("[data-leaning]") !== null;
  const tucked = (name: string) =>
    row(name).querySelector("[data-tucked]") !== null;
  const hold = (
    element: Element,
    type: "pointerdown" | "pointerup",
    pointerType = "mouse",
  ) => pointer(element, type, { x: 0, y: 0, pointerType });

  it("leans a row's plant toward a mouse and not toward a finger", () => {
    render(ageControl());

    pointerOnto(row("Odrasel"), "touch");
    expect(leaning("Odrasel")).toBe(false);

    pointerOnto(row("Odrasel"), "mouse");
    expect(leaning("Odrasel")).toBe(true);
  });

  // The press is the one gesture a phone gets before the pick.
  it("tucks the plant while its row is held, on a phone too", () => {
    render(ageControl());

    hold(row("Senior"), "pointerdown", "touch");
    expect(tucked("Senior")).toBe(true);

    hold(row("Senior"), "pointerup", "touch");
    expect(tucked("Senior")).toBe(false);
  });

  it("stands the plant upright from a pick until the pointer leaves", () => {
    // Only the timers: the growth ends on one.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      render(<StatefulAgeControl />);

      pointerOnto(row("Mladiček"), "mouse");
      expect(leaning("Mladiček")).toBe(true);

      hold(row("Mladiček"), "pointerdown");
      expect(leaning("Mladiček")).toBe(false);
      expect(tucked("Mladiček")).toBe(true);

      hold(row("Mladiček"), "pointerup");
      fireEvent.click(row("Mladiček"));
      expect(row("Mladiček").getAttribute("aria-pressed")).toBe("true");
      expect(leaning("Mladiček")).toBe(false);
      expect(tucked("Mladiček")).toBe(false);

      // Grown, and still upright while the pointer rests on it.
      act(() => vi.advanceTimersByTime(2000));
      expect(leaning("Mladiček")).toBe(false);

      pointerOff(row("Mladiček"));
      pointerOnto(row("Mladiček"), "mouse");
      expect(leaning("Mladiček")).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  // A pick that scrolls the page back to the results moves the sidebar
  // under a resting pointer, which leaves the row and comes back.
  it("keeps a growing plant upright when the pointer leaves and comes back", () => {
    render(<StatefulAgeControl />);

    pointerOnto(row("Mladiček"), "mouse");
    fireEvent.click(row("Mladiček"));
    pointerOff(row("Mladiček"));
    pointerOnto(row("Mladiček"), "mouse");

    expect(row("Mladiček").getAttribute("aria-pressed")).toBe("true");
    expect(leaning("Mladiček")).toBe(false);
  });

  // The grove keeps the motion it has; a press there tucks nothing.
  it("leaves the grove's plants to the grove when one is pressed", () => {
    const { container } = render(ageControl());
    const column = grove(container).querySelector('[data-age-stage="odrasel"]');

    pointer(column!, "pointerdown", { x: 0, y: 0, pointerType: "touch" });

    expect(container.querySelector("[data-tucked]")).toBeNull();
  });
});

describe("rowPlantPose", () => {
  const cue = (
    overrides: Partial<Parameters<typeof rowPlantPose>[0]>,
  ): Parameters<typeof rowPlantPose>[0] => ({
    stage: "odrasel",
    leaning: false,
    tucked: false,
    reduceMotion: false,
    ...overrides,
  });

  it("tucks a held plant toward its base and gives the height back in width", () => {
    for (const stage of STAGES) {
      const { animate } = rowPlantPose(cue({ stage, tucked: true })).tuck;
      expect(animate.scaleY).toBeGreaterThanOrEqual(0.88);
      expect(animate.scaleY).toBeLessThanOrEqual(0.95);
      expect(animate.scaleX).toBeGreaterThan(1);
    }
  });

  // A shear about the foot, so the sprout's soil stays level while the plant
  // above it bends; a negative skew carries the top toward the label.
  it("leans from the base on a spring, the sprout furthest and the tree least", () => {
    const leans = STAGES.map(
      (stage) => rowPlantPose(cue({ stage, leaning: true })).lean,
    );
    const degrees = leans.map(({ animate }) => -(animate.skewX as number));

    expect(leans.every(({ animate }) => animate.rotate === undefined)).toBe(
      true,
    );
    expect(degrees.every((angle) => angle > 0 && angle <= 8)).toBe(true);
    expect(degrees).toEqual([...degrees].sort((a, b) => b - a));
    for (const { transition } of leans) {
      expect(transition).toMatchObject({ type: "spring" });
    }
  });

  // A pick, a release or a leave can cut either gesture short. A keyframe
  // list would restart from its first frame; a single target carries on
  // from wherever the plant is.
  it("moves only ever towards a single target, so an interrupted gesture carries on", () => {
    for (const stage of STAGES) {
      for (const leaning of [false, true]) {
        for (const tucked of [false, true]) {
          const { lean, tuck } = rowPlantPose(cue({ stage, leaning, tucked }));
          for (const value of [
            ...Object.values(lean.animate),
            ...Object.values(tuck.animate),
          ]) {
            expect(Array.isArray(value)).toBe(false);
          }
        }
      }
    }
    // Let go, the plant springs back up.
    expect(rowPlantPose(cue({})).tuck).toMatchObject({
      animate: { scaleX: 1, scaleY: 1 },
      transition: { type: "spring" },
    });
  });

  it("holds the plant still under reduced motion", () => {
    const { lean, tuck } = rowPlantPose(
      cue({ leaning: true, tucked: true, reduceMotion: true }),
    );

    expect(lean).toEqual({ animate: { skewX: 0 }, transition: { duration: 0 } });
    expect(tuck).toEqual({
      animate: { scaleX: 1, scaleY: 1 },
      transition: { duration: 0 },
    });
  });
});

describe("isAgeStageActive", () => {
  it("maps the URL-friendly empty selection to every visible stage", () => {
    expect(isAgeStageActive([], "mladicek")).toBe(true);
    expect(isAgeStageActive([], "odrasel")).toBe(true);
    expect(isAgeStageActive([], "senior")).toBe(true);
  });
});

describe("age path motion", () => {
  it("makes every path update instant when reduced motion is requested", () => {
    expect(
      agePathTransition({
        draw: true,
        reduceMotion: true,
        path: { delay: 0.07, duration: 0.2 },
      }),
    ).toEqual({ duration: 0, delay: 0 });
  });

  // A pathLength draw is only growth if the pen goes down where the plant
  // grows from. Lucide's sprout starts at its leaf and its tree's trunk at
  // the canopy, so both grew downward into the soil.
  it("starts every plant's first stroke at its foot", () => {
    for (const stage of STAGES) {
      const [first] = AGE_STAGE_PATHS[stage]
        .filter((path) => !path.soil)
        .sort((a, b) => a.delay - b.delay);
      const start = startOf(first.d);

      expect(start.x).toBe(12);
      expect(start.y).toBeGreaterThanOrEqual(21);
    }
  });

  // Each canopy is two halves that leave the trunk at the same moment from
  // the same point, so it opens from the trunk rather than being traced
  // round from one side.
  it("opens both halves of a canopy from one point on the trunk", () => {
    for (const stage of ["odrasel", "senior"] as const) {
      const canopy = AGE_STAGE_PATHS[stage].filter((path) => !path.wood);

      expect(canopy).toHaveLength(2);
      expect(startOf(canopy[0].d)).toEqual(startOf(canopy[1].d));
      expect(canopy[0].delay).toBe(canopy[1].delay);
      expect(startOf(canopy[0].d).x).toBe(12);
    }
  });

  // A wilting leaf folds down about the point where it meets the stem, so
  // the two leaves turn opposite ways and only leaves carry a fold.
  it("folds only the sprout's two leaves, and both of them downward", () => {
    const folds = STAGES.flatMap((stage) =>
      AGE_STAGE_PATHS[stage].flatMap((path) => (path.fold ? [path] : [])),
    );

    expect(folds).toHaveLength(2);
    const [right, left] = folds;
    expect(startOf(right.d).x).toBeGreaterThan(12);
    expect(right.fold?.rotate).toBeGreaterThan(0);
    expect(left.fold?.rotate).toBeLessThan(0);
  });

  // A path waiting for its turn is held off by opacity, because pathLength 0
  // with round caps still paints a dot where the path starts.
  it("keeps a path's stroke off until its own turn to draw", () => {
    const transition = agePathTransition({
      draw: true,
      reduceMotion: false,
      path: { delay: 0.17, duration: 0.18 },
    });

    expect(transition).toMatchObject({
      pathLength: { delay: 0.17, duration: 0.18 },
      opacity: { delay: 0.17 },
    });
  });
});
