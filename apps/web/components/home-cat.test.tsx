// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HOME_CAT_FRAMING, HOME_CAT_POSTER_MEDIA, HomeCat } from "./home-cat";

// The model is covered by cat-model.test.tsx. What is this page's own is
// the framing and the start it asks for, and that the figure carries
// nothing else: his link lives in the hero's meta row (site-page.tsx).
vi.mock("./cat-model", () => ({
  CatModel: ({ framing, startAfterLoad, posterMedia }: { framing: { poster: string }; startAfterLoad?: boolean; posterMedia?: string }) => (
    <div
      data-testid="cat"
      data-poster={framing.poster}
      data-after-load={String(startAfterLoad)}
      data-poster-media={posterMedia}
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
    expect(container.querySelector("figcaption")).toBeNull();
    expect(container.querySelector("a")).toBeNull();
  });

  it("stays out of the phone hero and out of the row's flow", () => {
    const { container } = render(<HomeCat locale="sl" />);
    const classes = container.querySelector("figure")!.className.split(" ");
    expect(classes).toContain("hidden");
    expect(classes).toContain("md:block");
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
});
