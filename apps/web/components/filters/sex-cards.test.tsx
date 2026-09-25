// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/components/i18n-provider";
import { groupOptions } from "@/lib/filters";
import { SEX_DRAW, SexCards, outlineFade } from "./sex-cards";

type Timed = { duration: number; delay: number };

// Motion reads the media query once per file and keeps the answer, so the
// setting is asked through a mock the test can change.
const motion = vi.hoisted(() => ({ reduced: false }));
vi.mock("motion/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("motion/react")>()),
  useReducedMotion: () => motion.reduced,
}));

afterEach(() => {
  cleanup();
  motion.reduced = false;
});

describe("the sign's outline under the ink", () => {
  const steps = Object.entries(SEX_DRAW);

  // Why: outlineFade in sex-cards.tsx. The outline faded as one piece in
  // 0.15s, while the ink reached the arrowhead and the crossbar at 0.26s, so
  // for about 140ms the sign was missing its head.
  it("keeps each part until its own ink draws over it", () => {
    for (const [part, step] of steps) {
      const fade = outlineFade(step, {
        checked: true,
        reduceMotion: false,
        wait: 0,
      }) as Timed;

      // Nothing of the part goes faint before its pen goes down,
      expect(fade.delay, part).toBeCloseTo(step.delay);
      // and it is faint once the part is drawn.
      expect(fade.delay + fade.duration, part).toBeCloseTo(
        step.delay + step.duration,
      );
    }
    // Three parts on three clocks, or the check above says nothing.
    expect(new Set(steps.map(([, { delay }]) => delay)).size).toBe(3);
  });

  it("gives the whole outline back at once, in the card's turn", () => {
    const fades = steps.map(
      ([, step]) =>
        outlineFade(step, {
          checked: false,
          reduceMotion: false,
          wait: 0.045,
        }) as Timed,
    );

    expect(new Set(fades.map(({ delay }) => delay))).toEqual(new Set([0.045]));
    expect(new Set(fades.map(({ duration }) => duration)).size).toBe(1);
  });

  it("lands at once under reduced motion", () => {
    for (const checked of [true, false]) {
      for (const [, step] of steps) {
        expect(
          outlineFade(step, { checked, reduceMotion: true, wait: 0.09 }),
        ).toEqual({ duration: 0 });
      }
    }
  });
});

describe("the hidden ink of an unticked sign", () => {
  // Every transform written inside the two signs' ink layers.
  function inkTransforms() {
    const options = groupOptions("sex", [], "sl");
    const { container } = render(
      <I18nProvider locale="sl">
        <SexCards
          options={options}
          counts={new Map(options.map(({ value }) => [value, 3]))}
          selected={[]}
          onToggle={vi.fn()}
          layout="sidebar"
        />
      </I18nProvider>,
    );
    return [
      ...container.querySelectorAll<SVGGElement>(
        'g[stroke="var(--brand-strong)"] g',
      ),
    ].map((g) => g.style.transform);
  }

  // The server cannot know the setting and renders the exit pose; a client
  // that answered at rest under reduced motion hydrated a different
  // transform, which React reports as an attribute mismatch.
  it("rests in the same pose whatever the motion setting", () => {
    const moving = inkTransforms();
    cleanup();
    motion.reduced = true;
    const still = inkTransforms();

    expect(still).toEqual(moving);
    // The pose is really there, or the comparison proves nothing.
    expect(moving.some((transform) => transform.includes("-0.9px"))).toBe(true);
  });
});
