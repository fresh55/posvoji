import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AGE_STAGE_PATHS } from "@/components/filters/age-stage-paths";
import { FILTER_METADATA } from "@/lib/filters";
import { filterValueGlyph } from "./animal-icons";

describe("the age chips' marks", () => {
  // A row of age pills where two stages wore one symbol had to be read word
  // by word, so each stage keeps a mark of its own.
  it("gives every stage its own mark", () => {
    const icons = FILTER_METADATA.age.map(
      ({ value }) => filterValueGlyph("age", value).Icon,
    );

    expect(new Set(icons).size).toBe(FILTER_METADATA.age.length);
  });

  // Lucide has no young tree, so the chip draws the grove's own sapling.
  it("draws the grove's sapling for Mlad", () => {
    const { Icon } = filterValueGlyph("age", "mlad");
    const markup = renderToStaticMarkup(createElement(Icon, { "aria-hidden": true }));
    const drawn = [...markup.matchAll(/ d="([^"]+)"/g)].map(([, d]) => d);

    expect(drawn).toEqual(AGE_STAGE_PATHS.mlad.map(({ d }) => d));
    expect(markup).toContain("lucide-sapling");
  });
});
