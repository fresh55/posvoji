// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { POETIVO_INK, POETIVO_TILE } from "@/lib/poetivo-mark";
import { POETIVO_NAME } from "@/lib/site";
import { PoetivoLockup } from "./poetivo-lockup";

afterEach(cleanup);

describe("PoetivoLockup", () => {
  // Mark, then the words, in one reading order for both callers; the tile
  // in the brand's own colours, hidden from the accessible name.
  it("draws the tile first and the name after the verb", () => {
    const { container } = render(
      <span>
        <PoetivoLockup verb="Poganja" />
      </span>,
    );

    const row = container.firstElementChild!;
    expect(row.children).toHaveLength(2);
    const [svg, words] = Array.from(row.children);
    expect(svg.tagName).toBe("svg");
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.querySelector("rect")?.getAttribute("fill")).toBe(POETIVO_TILE);
    expect(svg.querySelector("path")?.getAttribute("fill")).toBe(POETIVO_INK);
    expect(words.textContent).toBe(`Poganja ${POETIVO_NAME}`);
    expect(words.querySelector(".font-semibold")?.textContent).toBe(POETIVO_NAME);
  });
});
