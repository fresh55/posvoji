// @vitest-environment jsdom

import { useState, type ComponentProps } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Drawer, DrawerContent, DrawerTitle, DrawerTrigger } from "./drawer";

beforeEach(() => {
  vi.stubGlobal("matchMedia", (media: string) => ({
    matches: false,
    media,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function Harness(props: ComponentProps<typeof DrawerContent> = {}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button>Outside</button>
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerTrigger>Filters</DrawerTrigger>
        <DrawerContent focusCloseOnOpen {...props}>
          <DrawerTitle>Filters</DrawerTitle>
          <button>First choice</button>
          <button>Last choice</button>
        </DrawerContent>
      </Drawer>
    </>
  );
}

describe("Drawer mount focus and presence", () => {
  it("focuses the close control, traps outside focus and returns to its trigger", async () => {
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Filters" });
    trigger.focus();
    fireEvent.click(trigger);
    const close = await screen.findByRole("button", { name: "Close" });
    await waitFor(() => expect(document.activeElement).toBe(close));

    screen.getByRole("button", { name: "Outside", hidden: true }).focus();
    expect(document.activeElement).toBe(close);

    const last = screen.getByRole("button", { name: "Last choice" });
    last.focus();
    fireEvent.keyDown(last, { key: "Tab" });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);

    fireEvent.keyDown(last, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    expect(document.body.hasAttribute("data-scroll-locked")).toBe(false);
  });

  it("keeps custom initial focus and the normal fallback without a close button", async () => {
    render(
      <Harness
        showCloseButton={false}
        onOpenAutoFocus={(event) => {
          screen.getByRole("button", { name: "Last choice" }).focus();
          event.preventDefault();
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole("button", { name: "Last choice" })),
    );
    cleanup();

    render(<Harness showCloseButton={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole("button", { name: "First choice" })),
    );
  });

  it("lets content and overlay finish their exits before unmounting", async () => {
    vi.stubGlobal("CSS", { escape: (name: string) => name });
    const readStyle = window.getComputedStyle.bind(window);
    vi.spyOn(window, "getComputedStyle").mockImplementation((element, pseudo) => {
      const style = readStyle(element, pseudo);
      if (!element.matches('[data-slot="drawer-content"], [data-slot="drawer-overlay"]')) return style;
      // Browser computed styles are live; jsdom's are snapshots. Supply that
      // one property so Presence sees the close animation change.
      return new Proxy(style, {
        get(target, property) {
          if (property === "animationName") {
            return element.getAttribute("data-state") === "open" ? "enter" : "exit";
          }
          return Reflect.get(target, property);
        },
      });
    });
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    const dialog = await screen.findByRole("dialog");
    const overlay = document.querySelector('[data-slot="drawer-overlay"]')!;
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(dialog.isConnected).toBe(true);
    expect(overlay.isConnected).toBe(true);
    expect(dialog.getAttribute("data-state")).toBe("closed");

    for (const element of [dialog, overlay]) {
      const end = new Event("animationend", { bubbles: true });
      Object.defineProperty(end, "animationName", { value: "exit" });
      fireEvent(element, end);
    }
    await waitFor(() => expect(dialog.isConnected).toBe(false));
    expect(overlay.isConnected).toBe(false);
    expect(document.body.hasAttribute("data-scroll-locked")).toBe(false);
  });
});
