// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { preloadModule, useDeferredModule } from "./use-deferred-module";

afterEach(cleanup);

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
