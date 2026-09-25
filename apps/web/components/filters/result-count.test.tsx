import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ResultCount } from "./result-count";

// The direction rule the roll reads is CountRoll's now, shared by both, and
// is tested beside it in filter-card.test.tsx.
describe("ResultCount", () => {
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
