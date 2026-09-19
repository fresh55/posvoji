// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CAT_CORNER,
  HOME_CAT_FRAMING,
  HOME_CAT_POSTER_MEDIA,
  HomeCat,
} from "./home-cat";
import { SRECKO_PATHS } from "@/lib/srecko";

// The model is covered by cat-model.test.tsx. What is this page's own is the
// framing, the start it asks for, and the caption under him.
vi.mock("./cat-model", () => ({
  CatModel: ({
    framing,
    startOnReach,
    className,
    posterMedia,
  }: {
    framing: { poster: string };
    startOnReach?: boolean;
    className?: string;
    posterMedia?: string;
  }) => (
    <div
      data-testid="cat"
      data-poster={framing.poster}
      data-on-reach={String(startOnReach)}
      className={className}
      data-poster-media={posterMedia}
    />
  ),
}));

afterEach(cleanup);

describe("the home cat", () => {
  it("asks for his own poster and waits for a reach before fetching him", () => {
    // The entry page: 2.1MB of cat decoded during the first click window cost
    // that click the better part of a second, and an idle callback lands
    // inside that window rather than after it.
    const { container } = render(<HomeCat locale="sl" />);
    const cat = container.querySelector('[data-testid="cat"]')!;
    expect(cat.getAttribute("data-poster")).toBe(HOME_CAT_FRAMING.poster);
    expect(cat.getAttribute("data-on-reach")).toBe("true");
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
    // No gate of its own: it is inside the figure, so it leaves with him,
    // which is what the landscape phone needs (the figure is short:hidden).
    expect(caption.className).not.toContain("short:");
    expect(container.querySelector("figure")!.className).toContain("short:hidden");
  });

  it("stays out of the phone hero and out of the row's flow", () => {
    const { container } = render(<HomeCat locale="sl" />);
    const classes = container.querySelector("figure")!.className.split(" ");
    expect(classes).toContain("hidden");
    expect(classes).toContain("md:flex");
    expect(classes).toContain("absolute");
    // The landscape phone is over md wide and has no corner for him.
    expect(classes).toContain("short:hidden");
  });

  it("asks for the poster only where the figure is drawn", () => {
    const { container } = render(<HomeCat locale="sl" />);
    const media = container
      .querySelector('[data-testid="cat"]')!
      .getAttribute("data-poster-media");
    expect(media).toBe(HOME_CAT_POSTER_MEDIA);
    // The two halves of the same gate: the class hides him below md and on a
    // viewport 32rem tall or less, so the media condition has to start above
    // both or a phone downloads a still it never draws.
    expect(media).toContain("min-width: 48rem");
    expect(media).toContain("min-height: 32.01rem");
  });

  it("takes its width from the corner the hero reserves", () => {
    // The corner and the drawing in it are one measurement, and this is
    // where that stops being a claim: the figure subtracts the 32px that
    // keeps a wrapped title off him rather than restating a width per
    // breakpoint, and the stage keeps the poster's shape rather than
    // restating a height. Retuning CAT_CORNER moves all of it, and its zero
    // on a phone held sideways is how the hero's padding leaves with him.
    const { container } = render(<HomeCat locale="sl" />);

    expect(container.querySelector("figure")!.className).toContain(
      "w-[calc(var(--cat-corner)-2rem)]",
    );
    expect(
      container.querySelector('[data-testid="cat"]')!.className,
    ).toContain("aspect-[192/152]");
    expect(CAT_CORNER).toBe(
      "[--cat-corner:11.5rem] lg:[--cat-corner:12.5rem] short-desktop:[--cat-corner:10rem] short:[--cat-corner:0rem]",
    );
  });

});
