// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PageShell } from "./page-shell";

afterEach(() => cleanup());

// The frame used to be copied into six page components, each of which then
// gave `main` a narrower max-width of its own. The header and the footer
// stayed on the wider grid, so at 1440px the logo began 96px to the left of
// the h1 under it on five of the six page types. These pin the two properties
// that stopped that happening again.
describe("PageShell", () => {
  it("holds the header, main and footer inside one width", () => {
    const { container } = render(
      <PageShell>
        <header />
        <main />
        <footer />
      </PageShell>,
    );

    const frame = container.firstElementChild as HTMLElement;
    expect(frame.className).toContain("max-w-5xl");
    // All three are children of the element carrying the width, which is what
    // makes their left edges the same edge.
    for (const tag of ["header", "main", "footer"]) {
      expect(container.querySelector(tag)?.parentElement).toBe(frame);
    }
  });

  it("gives the homepage the wider frame and nothing else", () => {
    const { container, rerender } = render(
      <PageShell width="wide">
        <main />
      </PageShell>,
    );
    expect(
      (container.firstElementChild as HTMLElement).className,
    ).toContain("max-w-7xl");

    rerender(
      <PageShell>
        <main />
      </PageShell>,
    );
    expect(
      (container.firstElementChild as HTMLElement).className,
    ).toContain("max-w-5xl");
  });

  it("grows to the bottom of the body instead of asking for a percentage", () => {
    // min-h-full resolved against a body whose own height is auto, so it did
    // nothing and a short page left the footer floating mid-viewport. The
    // shell is a flex item of the body's column, so flex-1 is what reaches
    // the bottom.
    const { container } = render(
      <PageShell>
        <main />
      </PageShell>,
    );
    const frame = (container.firstElementChild as HTMLElement).className;

    expect(frame).toContain("flex-1");
    expect(frame).not.toContain("min-h-full");
  });
});
