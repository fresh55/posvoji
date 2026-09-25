import { describe, expect, it } from "vitest";
import { SEX_DRAW, outlineFade } from "./sex-cards";

type Timed = { duration: number; delay: number };

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
