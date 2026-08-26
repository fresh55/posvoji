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

  it("renders the standalone variant as plain text, with no icon or chrome", () => {
    const markup = renderToStaticMarkup(
      <ResultCount count={12} locale="en" />,
    );

    expect(markup).not.toContain("lucide-dog");
    expect(markup).not.toContain("rounded-ui");
    expect(markup).not.toContain("bg-muted");
    expect(markup).toContain("text-sm");
    expect(markup).toContain("text-muted-foreground");
    expect(markup).toContain("tabular-nums");
    expect(markup).toContain("12 animals");
  });

  it("keeps the inline variant compact and decorative-icon free", () => {
    const markup = renderToStaticMarkup(
      <ResultCount
        count={1}
        locale="en"
        announce={false}
        variant="inline"
      />,
    );

    expect(markup).not.toContain("lucide-cat");
    expect(markup).toContain("1 animal");
  });

  it("renders the zero-result count as plain text too", () => {
    const markup = renderToStaticMarkup(
      <ResultCount count={0} locale="sl" />,
    );

    expect(markup).not.toContain("bg-muted/30");
    expect(markup).toContain("0 živali");
  });
});
