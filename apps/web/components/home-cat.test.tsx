// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HOME_CAT_FRAMING, HomeCat } from "./home-cat";
import { SRECKO_PATHS } from "@/lib/srecko";

// The model is covered by cat-model.test.tsx. What is this page's own is
// the framing it asks for, the link at his side, and that nothing else is
// written next to him.
vi.mock("./cat-model", () => ({
  CatModel: ({ framing }: { framing: { poster: string } }) => <div data-testid="cat" data-poster={framing.poster} />,
}));

afterEach(cleanup);

describe("the home cat", () => {
  it.each(["sl", "en"] as const)("gives him his own poster and only the memorial link (%s)", (locale) => {
    const { container } = render(<HomeCat locale={locale} />);
    expect(container.querySelector('[data-testid="cat"]')?.getAttribute("data-poster")).toBe(HOME_CAT_FRAMING.poster);
    const caption = container.querySelector("figcaption")!;
    expect(caption.querySelector("a")?.getAttribute("href")).toBe(SRECKO_PATHS[locale]);
    expect(caption.querySelector("p")).toBeNull();
    expect(caption.textContent).toBe(locale === "sl" ? "Spoznajte Srečka" : "Meet Srečko");
  });

  it("stays out of the phone hero and out of the row's flow", () => {
    const { container } = render(<HomeCat locale="sl" />);
    const classes = container.querySelector("figure")!.className.split(" ");
    expect(classes).toContain("hidden");
    expect(classes).toContain("md:block");
    expect(classes).toContain("absolute");
  });
});
