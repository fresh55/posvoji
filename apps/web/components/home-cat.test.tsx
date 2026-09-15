// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CAT_CORNER, HOME_CAT_FRAMING, HomeCat } from "./home-cat";
import { SRECKO_PATHS } from "@/lib/srecko";

// The model is covered by cat-model.test.tsx. What is this page's own is the
// framing, the start it asks for, and the caption under him.
vi.mock("./cat-model", () => ({
  CatModel: ({
    framing,
    startAfterLoad,
    className,
  }: {
    framing: { poster: string };
    startAfterLoad?: boolean;
    className?: string;
  }) => (
    <div
      data-testid="cat"
      data-poster={framing.poster}
      data-after-load={String(startAfterLoad)}
      className={className}
    />
  ),
}));

afterEach(cleanup);

describe("the home cat", () => {
  it("asks for his own poster and waits for the page before fetching him", () => {
    const { container } = render(<HomeCat locale="sl" />);
    const cat = container.querySelector('[data-testid="cat"]')!;
    expect(cat.getAttribute("data-poster")).toBe(HOME_CAT_FRAMING.poster);
    expect(cat.getAttribute("data-after-load")).toBe("true");
  });

  it("carries his name as the drawing's caption", () => {
    // It used to be the last item of the hero's meta row, held to the right
    // with ml-auto so it would sit under him, which put it beside the
    // found-animal link as a second underlined thing to press and, wherever
    // that row wrapped, diagonally below it aligned to nothing. A caption is
    // inside the box the corner already reserves, so no width can carry it
    // into the row.
    const { container } = render(<HomeCat locale="sl" />);

    const caption = container.querySelector("figcaption")!;
    expect(caption).toBeTruthy();
    const link = caption.querySelector("a")!;
    expect(link.getAttribute("href")).toBe(SRECKO_PATHS.sl);
    expect(link.className).toContain("text-xs");
    // Never in the landscape corner, which is 104px tall and has room for the
    // stage and nothing else.
    expect(caption.className.split(" ")).toContain("short:hidden");
  });

  it("stays out of the phone hero and out of the row's flow", () => {
    const { container } = render(<HomeCat locale="sl" />);
    const classes = container.querySelector("figure")!.className.split(" ");
    expect(classes).toContain("hidden");
    expect(classes).toContain("md:flex");
    expect(classes).toContain("absolute");
  });

  it("draws a smaller stage on a phone held sideways, in step with the corner it reserves", () => {
    // 128x100 against 152x120 and 168x132: the poster's shape at all three, so
    // the still is never letterboxed against a canvas that fills its box, and
    // each fits the corner it is drawn in: 158px at lg, 142 below it, 104 on a
    // phone held sideways. The corner reserves the figure plus the 32px that
    // keeps a wrapped title off him, and site-page.tsx pads by this property
    // rather than by a number of its own so the two cannot drift.
    const { container } = render(<HomeCat locale="sl" />);
    const classes = container.querySelector("figure")!.className.split(" ");
    const stage = container.querySelector('[data-testid="cat"]')!.className.split(" ");

    expect(classes).toContain("short:w-32");
    expect(stage).toContain("short:h-25");
    expect(CAT_CORNER).toContain("[--cat-corner:11.5rem]");
    expect(CAT_CORNER).toContain("lg:[--cat-corner:12.5rem]");
    expect(CAT_CORNER).toContain("short:[--cat-corner:10rem]");
  });
});
