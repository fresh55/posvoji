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
  it.each(["pageswap", "pagereveal"])("handles a skipped %s without an unhandled rejection", async (name) => {
    const { listeners, error } = setup();
    listeners.get(name)!({ viewTransition: { ready: Promise.reject(new DOMException("Transition was skipped", "AbortError")) } });
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
