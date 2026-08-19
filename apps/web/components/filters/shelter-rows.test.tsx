import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ShelterRows } from "./shelter-rows";

const rows = [
  { value: "macja-hisa", label: "Zavetišče Mačja hiša", city: "Celje" },
  { value: "sia-in-lu", label: "Zavetišče Sia in Lu", city: "Celje" },
];

const counts = new Map([
  ["macja-hisa", 5],
  ["sia-in-lu", 2],
]);

describe("ShelterRows hover linking", () => {
  it("tints the row(s) named by the highlighted prop, not the others", () => {
    const html = renderToStaticMarkup(
      <ShelterRows
        rows={rows}
        counts={counts}
        selected={[]}
        onToggle={() => undefined}
        highlighted={["sia-in-lu"]}
      />,
    );

    // Each row is one <button>...</button>; find the one that contains the
    // shelter's own label text.
    const rowTag = (label: string) =>
      html.split("<button").find((chunk) => chunk.includes(label)) ?? "";

    expect(rowTag("Sia in Lu")).toContain('data-highlighted="true"');
    expect(rowTag("Mačja hiša")).not.toContain("data-highlighted");
  });

  it("leaves every row untinted when nothing is highlighted", () => {
    const html = renderToStaticMarkup(
      <ShelterRows
        rows={rows}
        counts={counts}
        selected={[]}
        onToggle={() => undefined}
      />,
    );

    expect(html).not.toContain("data-highlighted");
  });
});
