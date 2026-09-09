import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PREHYDRATION_CLEAR_MS,
  PREHYDRATION_FILTER_SCRIPT,
} from "./prehydration-script";

// The script ships as source and runs in the document before React does, so the
// only honest way to check it is to run the source, against the two things it
// reads: a location and a documentElement to mark.
function runScript(search: string): Record<string, string> {
  const documentElement = { dataset: {} as Record<string, string> };
  const run = new Function("location", "document", PREHYDRATION_FILTER_SCRIPT);
  run({ search }, { documentElement });
  return documentElement.dataset;
}

function marks(search: string): boolean {
  return "filtering" in runScript(search);
}

describe("the pre-hydration filter script", () => {
  // The script arms a timer that outlives every case here. Fake timers keep
  // the self-clearing case deterministic and stop the rest from leaving live
  // six-second timers behind them.
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("marks an address that carries a filter", () => {
    expect(marks("?spol=samec")).toBe(true);
    expect(marks("?vrsta=ostalo&spol=samec")).toBe(true);
    expect(marks("?zavetisce=muri")).toBe(true);
    expect(marks("?druzba=otroci")).toBe(true);
  });

  it("marks a sort too, which reorders the same first screen", () => {
    expect(marks("?razvrsti=najmlajsi")).toBe(true);
  });

  it("leaves every other address alone", () => {
    expect(marks("")).toBe(false);
    expect(marks("?")).toBe(false);
    // Not this codec's param, and not this codec's business.
    expect(marks("?najdena=1")).toBe(false);
  });

  it("takes the mark off itself when the client render never arrives", () => {
    // AnimalGrid clears it seconds sooner on any page that hydrates. What this
    // pins is the page that does not: the mark cannot be left on, or the rule
    // in app/globals.css hides the results for good.
    const dataset = runScript("?vrsta=pes");
    expect("filtering" in dataset).toBe(true);

    vi.advanceTimersByTime(PREHYDRATION_CLEAR_MS);
    expect("filtering" in dataset).toBe(false);
  });
});
