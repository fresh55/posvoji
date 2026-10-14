// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/components/i18n-provider";
import { EMPTY_FILTERS, facetCounts, groupOptions } from "@/lib/filters";
import { DESKTOP_QUERY, REDUCED_MOTION_QUERY } from "@/lib/viewport-queries";
import { DesktopFilterGroups } from "./desktop-filter-groups";
import { resetFilterSectionsStore } from "./use-filter-sections";

const groupRender = vi.hoisted(() => vi.fn());

// Keep the real sections, markup and fold store. The forwarding spy only tells
// whether a mobile update reached the expensive subtree at all.
vi.mock("./filter-groups", async (importOriginal) => {
  const original = await importOriginal<typeof import("./filter-groups")>();
  return {
    ...original,
    FilterGroupsContent(props: ComponentProps<typeof original.FilterGroupsContent>) {
      groupRender(props);
      return <original.FilterGroupsContent {...props} />;
    },
  };
});

type Props = ComponentProps<typeof DesktopFilterGroups>;
const NOOP = () => undefined;
const PROPS: Props = {
  filters: EMPTY_FILTERS,
  groups: ["age", "sex"].map((group) => ({
    group: group as "age" | "sex",
    options: groupOptions(group as "age" | "sex", [], "sl"),
  })),
  counts: facetCounts([], EMPTY_FILTERS, new Date("2026-01-01")),
  toggles: [],
  toggleTally: new Map(),
  onToggle: NOOP,
  onToggleMany: NOOP,
  onToggleProperty: NOOP,
  onToggleManyProperties: NOOP,
};

let desktop = true;
const desktopListeners = new Set<() => void>();

function Page(props: Props) {
  return (
    <I18nProvider locale="sl">
      <DesktopFilterGroups {...props} />
    </I18nProvider>
  );
}

function resizeDesktop(next: boolean) {
  act(() => {
    desktop = next;
    for (const listener of [...desktopListeners]) listener();
  });
}

beforeEach(() => {
  desktop = true;
  desktopListeners.clear();
  groupRender.mockClear();
  window.localStorage.clear();
  resetFilterSectionsStore();
  window.history.replaceState(null, "", "/");
  vi.stubGlobal("matchMedia", (media: string) => ({
    media,
    get matches() {
      return media === DESKTOP_QUERY ? desktop : media === REDUCED_MOTION_QUERY;
    },
    addEventListener: (_event: string, listener: () => void) => {
      if (media === DESKTOP_QUERY) desktopListeners.add(listener);
    },
    removeEventListener: (_event: string, listener: () => void) => {
      if (media === DESKTOP_QUERY) desktopListeners.delete(listener);
    },
  }));
  window.scrollTo = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  resetFilterSectionsStore();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("desktop filter groups", () => {
  it.each([false, true])(
    "hydrates the exported groups without a mismatch at desktop=%s",
    async (wide) => {
      desktop = wide;
      const container = document.createElement("div");
      container.innerHTML = renderToString(<Page {...PROPS} />);
      document.body.append(container);
      const serverHeading = container.querySelector("h3");
      expect(serverHeading?.textContent).toContain("Starost");
      const recovered = vi.fn();
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
      let root: ReturnType<typeof hydrateRoot>;
      await act(async () => {
        root = hydrateRoot(container, <Page {...PROPS} />, {
          onRecoverableError: recovered,
        });
      });

      expect(recovered).not.toHaveBeenCalled();
      expect(consoleError).not.toHaveBeenCalled();
      if (wide) expect(container.querySelector("h3")).toBe(serverHeading);
      else expect(container.innerHTML).toBe("");

      act(() => root.unmount());
      container.remove();
      expect(desktopListeners.size).toBe(0);
    },
  );

  it("does no group rendering for mobile filter updates and mounts the latest props on desktop", () => {
    const { container, rerender, unmount } = render(<Page {...PROPS} />);
    expect(groupRender).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Starost" })).toBeTruthy();
    resizeDesktop(false);
    groupRender.mockClear();
    const filters: Props["filters"] = { ...EMPTY_FILTERS, sex: ["female"] };
    rerender(<Page {...PROPS} filters={filters} />);
    expect(container.innerHTML).toBe("");
    expect(groupRender).not.toHaveBeenCalled();

    resizeDesktop(true);
    expect(groupRender).toHaveBeenCalled();
    expect(groupRender.mock.lastCall?.[0].filters).toBe(filters);
    expect(screen.getByRole("button", { name: "Spol" }).getAttribute("aria-expanded"))
      .toBe("true");
    unmount();
    expect(desktopListeners.size).toBe(0);
  });

  it("remounts the desktop controls with the saved section folds", () => {
    render(<Page {...PROPS} />);
    const heading = screen.getByRole("button", { name: "Spol" });
    expect(heading.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(heading);
    expect(heading.getAttribute("aria-expanded")).toBe("true");

    resizeDesktop(false);
    expect(screen.queryByRole("button", { name: "Spol" })).toBeNull();
    resizeDesktop(true);
    const remounted = screen.getByRole("button", { name: "Spol" });
    expect(remounted).not.toBe(heading);
    expect(remounted.getAttribute("aria-expanded")).toBe("true");
  });

  it("keeps a selected section folded when the visitor closed it before resizing", () => {
    const filters: Props["filters"] = { ...EMPTY_FILTERS, age: ["mlad"] };
    render(<Page {...PROPS} filters={filters} />);
    const heading = screen.getByRole("button", { name: /^Starost/ });
    expect(heading.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(heading);
    expect(heading.getAttribute("aria-expanded")).toBe("false");

    resizeDesktop(false);
    resizeDesktop(true);

    expect(screen.getByRole("button", { name: /^Starost/ }).getAttribute("aria-expanded"))
      .toBe("false");
  });

  it("keeps a revealed section open after its last answer clears and the viewport changes", () => {
    const { rerender } = render(<Page {...PROPS} />);
    expect(screen.getByRole("button", { name: "Spol" }).getAttribute("aria-expanded"))
      .toBe("false");
    rerender(<Page {...PROPS} filters={{ ...EMPTY_FILTERS, sex: ["female"] }} />);
    expect(screen.getByRole("button", { name: "Spol" }).getAttribute("aria-expanded"))
      .toBe("true");
    rerender(<Page {...PROPS} />);

    resizeDesktop(false);
    resizeDesktop(true);

    expect(screen.getByRole("button", { name: "Spol" }).getAttribute("aria-expanded"))
      .toBe("true");
  });

  it("keeps the unanswered default folded after a shared link rearranges the sidebar", () => {
    window.history.replaceState(null, "", "/?spol=samica");
    // The exported page starts without filters; hydration supplies the link's
    // answer afterwards, making the default-open age section yield its room.
    const { rerender } = render(<Page {...PROPS} />);
    expect(screen.getByRole("button", { name: "Starost" }).getAttribute("aria-expanded"))
      .toBe("true");
    rerender(<Page {...PROPS} filters={{ ...EMPTY_FILTERS, sex: ["female"] }} />);
    expect(screen.getByRole("button", { name: "Starost" }).getAttribute("aria-expanded"))
      .toBe("false");

    resizeDesktop(false);
    resizeDesktop(true);

    expect(screen.getByRole("button", { name: "Starost" }).getAttribute("aria-expanded"))
      .toBe("false");
    expect(screen.getByRole("button", { name: "Spol" }).getAttribute("aria-expanded"))
      .toBe("true");
  });
});
