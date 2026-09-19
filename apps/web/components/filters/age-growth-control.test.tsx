import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { I18nProvider } from "@/components/i18n-provider";
import { groupOptions } from "@/lib/filters";
import { AgeGrowthControl, isAgeStageActive } from "./age-growth-control";
import { agePathTransition } from "./age-stage-icon";

const options = groupOptions("age", [], "sl");
const counts = new Map(options.map(({ value }) => [value, 3]));

function renderAgeControl(
  selected: string[] = [],
  layout: "sidebar" | "sheet" = "sidebar",
): string {
  return renderToStaticMarkup(
    <I18nProvider locale="sl">
      <AgeGrowthControl
        options={options}
        counts={counts}
        selected={selected}
        onToggle={() => undefined}
        onToggleMany={() => undefined}
        layout={layout}
      />
    </I18nProvider>,
  );
}

/**
 * The rendered stage buttons, each as its own opening tag. Matched on
 * aria-pressed rather than the toggle group's data-slot, because every stage
 * is wrapped in a tooltip trigger that takes the slot and the data-state over.
 */
function stageTags(html: string): string[] {
  return html.match(/<button[^>]*aria-pressed="[^"]*"[^>]*>/g) ?? [];
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
  // The tooltip trigger takes data-state over, so aria-pressed is the only
  // thing left saying the row is chosen, and toggleVariants spells the tile's
  // border and shadow against it. A chosen row that answers only data-state
  // came out brand-bordered over a shadow, which is the tile.
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
      agePathTransition({ draw: true, reduceMotion: true, delay: 0.07 }),
    ).toEqual({ duration: 0, delay: 0 });
  });

  it("keeps the full drawing sequence below 250ms", () => {
    const transition = agePathTransition({
      draw: true,
      reduceMotion: false,
      delay: 0.07,
    });

    expect(transition.duration + transition.delay).toBeLessThanOrEqual(0.24);
  });
});
