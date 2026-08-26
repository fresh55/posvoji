import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { I18nProvider } from "@/components/i18n-provider";
import { groupOptions } from "@/lib/filters";
import { AgeGrowthControl, isAgeStageActive } from "./age-growth-control";
import { agePathTransition } from "./age-stage-icon";

const options = groupOptions("age", [], "sl");
const counts = new Map(options.map(({ value }) => [value, 3]));

function renderAgeControl(selected: string[] = []): string {
  return renderToStaticMarkup(
    <I18nProvider locale="sl">
      <AgeGrowthControl
        options={options}
        counts={counts}
        selected={selected}
        onToggle={() => undefined}
        onToggleMany={() => undefined}
      />
    </I18nProvider>,
  );
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
    expect(html).toContain("Izberi eno ali več starosti.");
  });

  it("keeps the reset action stable but unreachable until a filter is selected", () => {
    const inactiveHtml = renderAgeControl();
    const activeHtml = renderAgeControl(["odrasel"]);

    expect(inactiveHtml).toContain('aria-hidden="true"');
    expect(inactiveHtml).toMatch(
      /tabindex="-1" aria-label="Ponastavi filter starosti"/,
    );
    expect(activeHtml).toContain('aria-hidden="false"');
    expect(activeHtml).not.toMatch(
      /tabindex="-1" aria-label="Ponastavi filter starosti"/,
    );
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
