// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AboutCat } from "./about-cat";
import { SRECKO_PATHS, SRECKO_TEXT } from "@/lib/srecko";

// The model itself is covered by cat-model.test.tsx. What is this page's own
// is the introduction under it, and that it stays under it.
vi.mock("./cat-model", () => ({ CatModel: ({ deferOnLimitedConnection, renderCaption }: {
  deferOnLimitedConnection?: boolean;
  renderCaption?: (action: ReactNode) => ReactNode;
}) =>
  <>
    <div data-testid="cat" data-limited-connection={deferOnLimitedConnection} />
    {renderCaption?.(<button type="button">Start</button>)}
  </>,
}));

afterEach(cleanup);

describe("the about cat", () => {
  it.each(["sl", "en"] as const)("keeps the introduction and memorial link below the model (%s)", (locale) => {
    const { container } = render(<AboutCat locale={locale} />);
    const caption = container.querySelector("figcaption")!;
    expect(caption.querySelector("p")?.textContent).toBe(SRECKO_TEXT[locale].intro);
    expect(caption.querySelector("a")?.getAttribute("href")).toBe(SRECKO_PATHS[locale]);
    expect(caption.querySelector("button")?.textContent).toBe("Start");
    expect(caption.querySelector("button")?.parentElement).toBe(caption.querySelector("a")?.parentElement);
    expect(container.querySelector('[data-testid="cat"] button')).toBeNull();
    expect(container.querySelector("details")).toBeNull();
    expect(container.querySelector('[data-testid="cat"]')?.getAttribute("data-limited-connection")).toBe("true");
    expect(
      container.querySelector('[data-testid="cat"]')!.compareDocumentPosition(caption) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
