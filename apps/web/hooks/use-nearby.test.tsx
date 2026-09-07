// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/components/i18n-provider";
import { useNearby, resetNearbyStore } from "./use-nearby";

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <I18nProvider locale="en">{children}</I18nProvider>
);
let success: PositionCallback;
let failure: PositionErrorCallback;
beforeEach(() => {
  resetNearbyStore();
  vi.useFakeTimers();
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: {
      getCurrentPosition: vi.fn(
        (yes: PositionCallback, no: PositionErrorCallback) => {
          success = yes;
          failure = no;
        },
      ),
    },
  });
});
afterEach(() => {
  cleanup();
  resetNearbyStore();
  vi.useRealTimers();
});
const succeed = () =>
  success({ coords: { latitude: 46, longitude: 15 } } as GeolocationPosition);
describe("page-session geolocation", () => {
  it.each([1, 2, 3])("handles browser error %s and can retry", (code) => {
    const { result } = renderHook(useNearby, { wrapper });
    act(() => result.current.toggle());
    act(() => failure({ code } as GeolocationPositionError));
    expect(result.current.state.status).toBe("error");
    act(() => result.current.toggle());
    act(succeed);
    expect(result.current.state.status).toBe("on");
  });
  it("times out an unanswered prompt and ignores its late success", () => {
    const { result } = renderHook(useNearby, { wrapper });
    act(() => result.current.toggle());
    act(() => vi.advanceTimersByTime(10000));
    expect(result.current.state.status).toBe("error");
    act(succeed);
    expect(result.current.state.status).toBe("error");
  });
  it("cancels a request from either mounted control", () => {
    const first = renderHook(useNearby, { wrapper });
    const second = renderHook(useNearby, { wrapper });
    act(() => first.result.current.toggle());
    expect(second.result.current.state.status).toBe("locating");
    act(() => second.result.current.toggle());
    act(succeed);
    act(() => vi.advanceTimersByTime(10000));
    expect(first.result.current.state.status).toBe("off");
    expect(second.result.current.state.status).toBe("off");
  });
  it("retains a granted fix across responsive unmounts", () => {
    const first = renderHook(useNearby, { wrapper });
    act(() => first.result.current.toggle());
    act(succeed);
    first.unmount();
    const second = renderHook(useNearby, { wrapper });
    expect(second.result.current.state).toEqual({
      status: "on",
      at: { lat: 46, lon: 15 },
    });
    act(() => second.result.current.turnOff());
    expect(second.result.current.state.status).toBe("off");
  });
});
