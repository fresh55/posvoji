// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { POETIVO_INK, POETIVO_TILE } from "@/lib/poetivo-mark";
import { POETIVO_NAME } from "@/lib/site";
import { PoetivoLockup } from "./poetivo-lockup";

afterEach(cleanup);

describe("PoetivoLockup", () => {
  // One span in the text flow, so a caller's underline reaches the words:
  // the verb, a word space, then the tile pressed against the name. The tile
  // in the brand's own colours, hidden from the accessible name.
  it("draws the verb, then the tile against the name", () => {
    const { container } = render(<PoetivoLockup verb="Poganja" />);

    expect(container.children).toHaveLength(1);
    const words = container.firstElementChild!;
    expect(words.tagName).toBe("SPAN");
    expect(words.textContent).toBe(`Poganja ${POETIVO_NAME}`);

    const [svg, name] = Array.from(words.children);
    expect(svg.tagName).toBe("svg");
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.querySelector("rect")?.getAttribute("fill")).toBe(POETIVO_TILE);
    expect(svg.querySelector("path")?.getAttribute("fill")).toBe(POETIVO_INK);
    expect(name.className).toContain("font-semibold");
    expect(name.textContent).toBe(POETIVO_NAME);
    // The space is before the tile, never between the tile and the name.
    expect(svg.previousSibling?.textContent).toBe("Poganja ");
    expect(svg.nextSibling).toBe(name);
  });
});
