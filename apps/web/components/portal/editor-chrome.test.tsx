// @vitest-environment jsdom

import { act, cleanup, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { EditorSaveBar } from "./editor-chrome";
import { PortalShell } from "./portal-shell";

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("updates the shell's height variable when the save bar resizes and clears it on unmount", () => {
  let height = 69;
  let resized = () => {};
  const disconnect = vi.fn();
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(() => ({ height }) as DOMRect);
  vi.stubGlobal("ResizeObserver", class {
    constructor(callback: () => void) { resized = callback; }
    observe() {}
    disconnect = disconnect;
  });
  const view = render(
    <div data-portal-shell>
      <EditorSaveBar saving={false} cancelDisabled={false} saveDisabled={false} onCancel={() => {}} />
      <footer>Footer navigation</footer>
    </div>,
  );
  const shell = view.container.querySelector<HTMLElement>("[data-portal-shell]")!;
  expect(shell.style.getPropertyValue("--portal-save-bar-height")).toBe("69px");
  height = 151;
  act(resized);
  expect(shell.style.getPropertyValue("--portal-save-bar-height")).toBe("151px");
  view.unmount();
  expect(disconnect).toHaveBeenCalledOnce();
  expect(shell.style.getPropertyValue("--portal-save-bar-height")).toBe("");
});

// The bar is fixed over a page that scrolls the whole document. A phone browser
// changes env(safe-area-inset-bottom) as its bars hide and show, so padding by
// it moved the bar's buttons and changed its measured height, and with it the
// shell's padding, on every change of scroll direction. Both read the constant
// inset. Classes and not layout, because jsdom resolves no env().
it("keeps the save bar and the shell's room for it on the constant inset", () => {
  const view = render(
    <PortalShell>
      <EditorSaveBar saving={false} cancelDisabled={false} saveDisabled={false} onCancel={() => {}} />
    </PortalShell>,
  );
  const shell = view.container.querySelector<HTMLElement>("[data-portal-shell]")!;
  const bar = view.container.querySelector<HTMLElement>("[data-save-bar]")!;
  expect(bar.className).toContain("max-lg:pb-[calc(0.75rem+var(--dock-inset))]");
  expect(shell.className).toContain("calc(4.5rem+var(--dock-inset))");
  expect(bar.className).not.toContain("safe-area-inset-bottom");
  expect(shell.className).not.toContain("safe-area-inset-bottom");
});
