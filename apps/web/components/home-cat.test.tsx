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

  it("takes its width from the corner the hero reserves", () => {
    // The corner and the drawing in it are one measurement, and this is
    // where that stops being a claim: the figure subtracts the 32px that
    // keeps a wrapped title off him rather than restating a width per
    // breakpoint, and the stage keeps the poster's shape rather than
    // restating a height. Retuning CAT_CORNER moves all of it.
    const { container } = render(<HomeCat locale="sl" />);

    expect(container.querySelector("figure")!.className).toContain(
      "w-[calc(var(--cat-corner)-2rem)]",
    );
    expect(
      container.querySelector('[data-testid="cat"]')!.className,
    ).toContain("aspect-[192/152]");
    expect(CAT_CORNER).toBe(
      "[--cat-corner:11.5rem] lg:[--cat-corner:12.5rem] short:[--cat-corner:10rem]",
    );
  });

});
