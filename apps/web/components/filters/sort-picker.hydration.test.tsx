// @vitest-environment jsdom

import { act } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/components/i18n-provider";
import {
  resetNearbyOriginStore,
  usePublishNearbyOrigin,
} from "@/hooks/use-nearby-origin";
import { cityAt } from "@/lib/geo";
import { getMessages } from "@/lib/i18n";
import type { ResolvedOrigin } from "@/lib/origin";
import { SortPicker } from "./sort-picker";

const en = getMessages("en");

const LJUBLJANA: ResolvedOrigin = {
  at: cityAt("Ljubljana")!,
  source: "typed",
  label: "Ljubljana",
};

// The location picker's side of the store, with nothing of the picker in it.
function GrantOrigin() {
  usePublishNearbyOrigin(LJUBLJANA);
  return null;
}

// The picker as a shared ?razvrsti=najblizje link hands it over: the URL asks
// for the one order that needs a runtime origin.
function Tree() {
  return (
    <I18nProvider locale="en">
      <SortPicker value="nearest" onChange={() => undefined} />
    </I18nProvider>
  );
}

// React reports a mismatch by throwing it away and re-rendering the subtree on
// the client, then handing the error here. Asserting on this rather than on a
// console.error string: the recovery is the fact, and a text-only mismatch
// reaches this callback whether or not React also decides to log about it.
function hydrateTree(container: HTMLElement) {
  const recovered: unknown[] = [];
  const root = hydrateRoot(container, <Tree />, {
    onRecoverableError: (error) => recovered.push(error),
  });
  return { root, recovered };
}

beforeEach(() => resetNearbyOriginStore());

afterEach(() => {
  resetNearbyOriginStore();
  vi.restoreAllMocks();
});

describe("SortPicker hydration", () => {
  it("hydrates against server markup that has no origin in it", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const container = document.createElement("div");
    // The server has no origin and never can: nothing it can see says where the
    // visitor is, so it writes the default order and no nearest option.
    container.innerHTML = renderToString(<Tree />);
    expect(container.textContent).toContain(en.sortLongestInShelter);
    expect(container.textContent).not.toContain(en.sortNearest);

    // An origin already in the store before this markup is hydrated, which is
    // the case that could mismatch: useNearbyOrigin has to hand the hydrating
    // render the server snapshot rather than this one.
    const writer = document.createElement("div");
    const writerRoot = createRoot(writer);
    await act(async () => writerRoot.render(<GrantOrigin />));

    const { root, recovered } = hydrateTree(container);
    await act(async () => undefined);

    expect(recovered).toEqual([]);
    // And the origin is not lost by being early: the commit after hydration is
    // where the option and its label arrive.
    expect(container.textContent).toContain(en.sortNearest);

    await act(async () => {
      root.unmount();
      writerRoot.unmount();
    });
  });

  it("stays on the default order through hydration when no origin arrives", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const container = document.createElement("div");
    container.innerHTML = renderToString(<Tree />);

    const { root, recovered } = hydrateTree(container);
    await act(async () => undefined);

    expect(recovered).toEqual([]);
    expect(container.textContent).toContain(en.sortLongestInShelter);
    expect(container.textContent).not.toContain(en.sortNearest);

    await act(async () => root.unmount());
  });
});
