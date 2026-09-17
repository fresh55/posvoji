// @vitest-environment jsdom

import { act, cleanup, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { EditorSaveBar } from "./editor-chrome";

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("keeps footer clearance equal to the save bar including a wrapped error and clears it on unmount", () => {
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
