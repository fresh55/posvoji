// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { preloadModule, useDeferredModule } from "./use-deferred-module";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("does not reopen a cancelled load and reuses its result on the next open", async () => {
  let finish!: (value: { ready: boolean }) => void;
  const load = vi.fn(
    () =>
      new Promise<{ ready: boolean }>((resolve) => {
        finish = resolve;
      }),
  );
  const view = renderHook(({ open }) => useDeferredModule(load, open), {
    initialProps: { open: false },
  });
  expect(load).not.toHaveBeenCalled();
  view.rerender({ open: true });
  view.rerender({ open: false });
  await act(async () => {
    finish({ ready: true });
  });
  expect(view.result.current.module).toBeUndefined();
  view.rerender({ open: true });
  await waitFor(() =>
    expect(view.result.current.module).toEqual({ ready: true }),
  );
  expect(load).toHaveBeenCalledTimes(1);
});

it("lets a press retry after an idle prefetch fails", async () => {
  const load = vi
    .fn()
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValue({ ready: true });
  await expect(preloadModule(load)).rejects.toThrow("offline");
  const view = renderHook(() => useDeferredModule(load, true));
  await waitFor(() =>
    expect(view.result.current.module).toEqual({ ready: true }),
  );
  expect(view.result.current.error).toBe(false);
});

it("skips optional idle downloads on Save-Data but still loads on open", async () => {
  vi.stubGlobal("navigator", { connection: { saveData: true } });
  const idle = vi.fn();
  vi.stubGlobal("requestIdleCallback", idle);
  const load = vi.fn(async () => ({ ready: true }));
  const view = renderHook(({ open }) => useDeferredModule(load, open, { warmOnIdle: true }), {
    initialProps: { open: false },
  });
  expect(idle).not.toHaveBeenCalled();
  expect(load).not.toHaveBeenCalled();
  view.rerender({ open: true });
  await waitFor(() => expect(view.result.current.module).toEqual({ ready: true }));
  expect(load).toHaveBeenCalledTimes(1);
});

it("does not schedule the timer fallback on Save-Data", () => {
  vi.useFakeTimers();
  vi.stubGlobal("navigator", { connection: { saveData: true } });
  vi.stubGlobal("requestIdleCallback", undefined);
  const load = vi.fn(async () => ({ ready: true }));
  renderHook(() => useDeferredModule(load, false, { warmOnIdle: true }));
  act(() => vi.advanceTimersByTime(5000));
  expect(load).not.toHaveBeenCalled();
});

it.each(["idle", "timer"])(
  "skips a queued %s download if Save-Data is enabled before it runs",
  async (scheduler) => {
    vi.useFakeTimers();
    const connection = { saveData: false };
    vi.stubGlobal("navigator", { connection });
    let onIdle!: IdleRequestCallback;
    vi.stubGlobal("requestIdleCallback", scheduler === "idle"
      ? vi.fn((callback: IdleRequestCallback) => { onIdle = callback; return 1; })
      : undefined);
    vi.stubGlobal("cancelIdleCallback", vi.fn());
    const load = vi.fn(async () => ({ ready: true }));
    renderHook(() => useDeferredModule(load, false, { warmOnIdle: true }));
    expect(load).not.toHaveBeenCalled();

    connection.saveData = true;
    await act(async () => {
      if (scheduler === "idle") onIdle({ didTimeout: false, timeRemaining: () => 50 });
      else await vi.advanceTimersByTimeAsync(2000);
    });
    expect(load).not.toHaveBeenCalled();
  },
);

it("retains idle warming when the browser provides no connection information", async () => {
  let onIdle!: IdleRequestCallback;
  vi.stubGlobal("requestIdleCallback", vi.fn((callback: IdleRequestCallback) => {
    onIdle = callback;
    return 1;
  }));
  vi.stubGlobal("cancelIdleCallback", vi.fn());
  const load = vi.fn(async () => ({ ready: true }));
  renderHook(() => useDeferredModule(load, false, { warmOnIdle: true }));
  await act(async () => onIdle({ didTimeout: false, timeRemaining: () => 50 }));
  expect(load).toHaveBeenCalledTimes(1);
});
