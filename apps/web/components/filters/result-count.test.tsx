import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { countDirection, ResultCount } from "./result-count";

describe("ResultCount", () => {
  it.each([
    [0, 1, 1],
    [1, 0, -1],
    [9, 10, 1],
    [99, 100, 1],
    [100, 99, -1],
    [12, 12, 0],
  ] as const)("detects the direction from %i to %i", (previous, next, direction) => {
    expect(countDirection(previous, next)).toBe(direction);
  });

  it("renders a species icon without an empty internal number slot", () => {
    const markup = renderToStaticMarkup(
      <ResultCount count={12} species="dog" locale="en" />,
    );

    expect(markup).toContain("lucide-dog");
    expect(markup).toContain("min-w-24");
    expect(markup).not.toContain("min-w-[4ch]");
    expect(markup).toContain("12 animals");
  });

  it("keeps the button variant compact and decorative-icon free", () => {
    const markup = renderToStaticMarkup(
      <ResultCount
        count={1}
        species="cat"
        locale="en"
        announce={false}
        variant="inline"
      />,
    );

    expect(markup).not.toContain("lucide-cat");
    expect(markup).not.toContain("min-w-[4ch]");
    expect(markup).toContain("1 animal");
  });

  it("renders a calm zero-result state", () => {
    const markup = renderToStaticMarkup(
      <ResultCount count={0} species="all" locale="sl" />,
    );

    expect(markup).toContain("bg-muted/30");
    expect(markup).toContain("text-muted-foreground/50");
    expect(markup).toContain('data-empty-pose="all"');
    expect(markup).toContain("0 živali");
  });

  it("renders the two-paw clear trail only when explicitly triggered", () => {
    const resting = renderToStaticMarkup(
      <ResultCount count={12} species="all" locale="en" />,
    );
    const cleared = renderToStaticMarkup(
      <ResultCount
        count={12}
        species="all"
        locale="en"
        clearTrailKey={1}
      />,
    );

    expect(resting).not.toContain("data-clear-trail");
    expect(cleared).toContain("data-clear-trail");
  });
});
