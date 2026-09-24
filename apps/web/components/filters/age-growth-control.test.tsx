// @vitest-environment jsdom

import { cleanup, fireEvent, render } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/components/i18n-provider";
import { groupOptions } from "@/lib/filters";
import {
  AgeGrowthControl,
  groundSink,
  isAgeStageActive,
  plantMotion,
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
  function grove(container: HTMLElement): HTMLElement {
    const element = container.querySelector<HTMLElement>(
      '[data-age-view="grove"]',
    );
    if (!element) throw new Error("no grove");
    return element;
  }

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
    gusting: false,
    grown: null,
    ...overrides,
  });
  const peak = (values: unknown) => Math.max(...(values as number[]));
  const rotateDelay = (transition: unknown) =>
    (transition as { rotate: { delay?: number } }).rotate.delay ?? 0;

  // Each stage says goodbye in its own register rather than all fading alike.
  it("wilts an unpicked sprout and shivers an unpicked shrub", () => {
    const sprout = plantMotion(cue({ leaving: true })).animate;
    const shrub = plantMotion(
      cue({ stage: "odrasel", index: 1, leaving: true }),
    ).animate;

    expect(Math.min(...(sprout.scaleY as number[]))).toBeLessThan(0.95);
    // A shiver goes both ways, several times, and never far.
    const turns = shrub.rotate as number[];
    expect(turns.filter((degrees) => degrees < 0).length).toBeGreaterThan(1);
    expect(turns.filter((degrees) => degrees > 0).length).toBeGreaterThan(1);
    expect(peak(turns.map(Math.abs))).toBeLessThan(2);
  });

  it("blows a reset's gust through the grove from the left", () => {
    const moves = (["mladicek", "odrasel", "senior"] as const).map(
      (stage, index) => plantMotion(cue({ stage, index, gusting: true })),
    );
    const delays = moves.map(({ transition }) => rotateDelay(transition));
    const bends = moves.map(({ animate }) => peak(animate.rotate));

    // Every plant bends the same way, downwind, one after another.
    expect(delays).toEqual([...delays].sort((a, b) => a - b));
    expect(new Set(delays).size).toBe(3);
    expect(bends.every((degrees) => degrees > 0)).toBe(true);
    // The sprout bends furthest and the tree least.
    expect(bends).toEqual([...bends].sort((a, b) => b - a));
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
