// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CAT_CORNER, HOME_CAT_FRAMING, HomeCat } from "./home-cat";

// The model is covered by cat-model.test.tsx. What is this page's own is
// the framing and the start it asks for, and that the figure carries
// nothing else: his link lives in the hero's meta row (site-page.tsx).
vi.mock("./cat-model", () => ({
  CatModel: ({ framing, startAfterLoad }: { framing: { poster: string }; startAfterLoad?: boolean }) => (
    <div data-testid="cat" data-poster={framing.poster} data-after-load={String(startAfterLoad)} />
  ),
}));

afterEach(cleanup);

describe("the home cat", () => {
  it("asks for his own poster and waits for the page before fetching him", () => {
    const { container } = render(<HomeCat locale="sl" />);
    const cat = container.querySelector('[data-testid="cat"]')!;
    expect(cat.getAttribute("data-poster")).toBe(HOME_CAT_FRAMING.poster);
    expect(cat.getAttribute("data-after-load")).toBe("true");
    expect(container.querySelector("figcaption")).toBeNull();
    expect(container.querySelector("a")).toBeNull();
  });

  it("stays out of the phone hero and out of the row's flow", () => {
    const { container } = render(<HomeCat locale="sl" />);
    const classes = container.querySelector("figure")!.className.split(" ");
    expect(classes).toContain("hidden");
    expect(classes).toContain("md:block");
    expect(classes).toContain("absolute");
  });

  it("draws a smaller stage on a phone held sideways, in step with the corner it reserves", () => {
    // 128x100 against 192x152: near enough the same shape that the poster is
    // still the model's own first frame rather than a letterboxed one, and
    // short enough that the heading beside it keeps to one line on a 390px
    // tall screen. The corner is the stage plus the 32px that keeps a wrapped
    // title off him, at both sizes, and site-page.tsx pads by this property
    // rather than by a number of its own so the two cannot drift.
    const { container } = render(<HomeCat locale="sl" />);
    const classes = container.querySelector("figure")!.className.split(" ");

    expect(classes).toContain("short:h-25");
    expect(classes).toContain("short:w-32");
    expect(CAT_CORNER).toContain("[--cat-corner:14rem]");
    expect(CAT_CORNER).toContain("short:[--cat-corner:10rem]");
  });
});
