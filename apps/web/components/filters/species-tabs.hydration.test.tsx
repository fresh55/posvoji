// @vitest-environment jsdom

import { act } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/components/i18n-provider";
import { SpeciesTabs } from "./species-tabs";

const TALLY = { all: 4, dog: 1, cat: 1, other: 2 };

// The strip as a shared ?vrsta=macka link hands it over: a species is already
// pressed in the markup the server wrote.
function Tree() {
  return (
    <I18nProvider locale="en">
      <SpeciesTabs
        value="cat"
        onChange={() => undefined}
        counts={TALLY}
        roster={TALLY}
      />
    </I18nProvider>
  );
}

function pressedTab(container: HTMLElement) {
  return container.querySelector('button[aria-pressed="true"]');
}

afterEach(() => vi.restoreAllMocks());

describe("SpeciesTabs hydration", () => {
  it("keeps a background under the pressed tab until the fill can be measured", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const container = document.createElement("div");
    container.innerHTML = renderToString(<Tree />);

    // The server cannot measure a button, so it writes no fill. If it wrote
    // one anyway it would be a dark pill at the left edge, under Vse, on
    // every link that asked for a species.
    expect(container.querySelector('[data-slot="species-fill"]')).toBeNull();
    // Which is why the pressed tab is still carrying its own ground here.
    expect(pressedTab(container)?.className).toContain("bg-foreground");
    expect(pressedTab(container)?.textContent).toContain("Cats");

    const recovered: unknown[] = [];
    const root = hydrateRoot(container, <Tree />, {
      onRecoverableError: (error) => recovered.push(error),
    });
    await act(async () => undefined);

    // No mismatch: the flag reads false for the hydrating render too, so the
    // client's first pass draws the markup the server did.
    expect(recovered).toEqual([]);

    // And the handover happens in the commit after, with the tab giving the
    // ground up in the same pass that the fill arrives to take it over. A
    // frame with a pressed tab and nothing under it is the one thing this is
    // all for.
    expect(
      container.querySelectorAll('[data-slot="species-fill"]').length,
    ).toBe(1);
    expect(pressedTab(container)?.className).not.toContain("bg-foreground");
    expect(pressedTab(container)?.className).toContain("text-background");

    await act(async () => root.unmount());
  });
});
