import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { VIEW_TRANSITION_SCRIPT } from "./view-transition-script";

function setup() {
  const listeners = new Map<string, (event: { viewTransition?: { ready: Promise<void> } | null }) => void>();
  const error = vi.fn();
  runInNewContext(VIEW_TRANSITION_SCRIPT, {
    window: { addEventListener: (name: string, listener: (event: object) => void) => listeners.set(name, listener) },
    console: { error },
  });
  return { listeners, error };
}

describe("cross-document transition cancellation", () => {
  it.each([
    ["pageswap", "AbortError", "Transition was skipped"],
    ["pagereveal", "AbortError", "Transition was skipped"],
    ["pageswap", "InvalidStateError", "Transition was aborted because of invalid state"],
    ["pagereveal", "InvalidStateError", "Transition was aborted because of invalid state"],
  ])("handles %s %s without logging an error or leaking a rejection", async (eventName, errorName, message) => {
    const { listeners, error } = setup();
    listeners.get(eventName)!({ viewTransition: { ready: Promise.reject(new DOMException(message, errorName)) } });
    await Promise.resolve();
    expect(error).not.toHaveBeenCalled();
    expect([...listeners.keys()]).toEqual(["pageswap", "pagereveal"]);
  });

  it("reports unexpected transition failures instead of hiding them", async () => {
    const { listeners, error } = setup();
    const failure = new Error("Snapshot failed");
    listeners.get("pagereveal")!({ viewTransition: { ready: Promise.reject(failure) } });
    await Promise.resolve();
    expect(error).toHaveBeenCalledExactlyOnceWith(failure);
  });

  it("accepts successful transitions and ordinary navigation without a transition", async () => {
    const { listeners, error } = setup();
    const observe = listeners.get("pagereveal")!;
    observe({});
    observe({ viewTransition: null });
    observe({ viewTransition: { ready: Promise.resolve() } });
    await Promise.resolve();
    expect(error).not.toHaveBeenCalled();
  });
});
