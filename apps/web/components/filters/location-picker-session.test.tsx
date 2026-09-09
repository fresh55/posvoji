// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/components/i18n-provider";
import { DESKTOP_QUERY } from "@/hooks/use-desktop-breakpoint-close";
import {
  resetNearbyOriginStore,
  useNearbyOrigin,
} from "@/hooks/use-nearby-origin";
import { LocationPicker } from "./location-picker";
import { SHELTER_SPOTLIGHT_EVENT } from "@/lib/shelter-spotlight";

let desktop = false;
let change: EventTarget;
let success: PositionCallback;
beforeEach(() => {
  desktop = false;
  change = new EventTarget();
  resetNearbyOriginStore();
  history.replaceState(null, "", "/");
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (media: string) => ({
      get matches() {
        return media === DESKTOP_QUERY && desktop;
      },
      media,
      addEventListener: (name: string, listener: EventListener) => {
        if (media === DESKTOP_QUERY) change.addEventListener(name, listener);
      },
      removeEventListener: (name: string, listener: EventListener) => {
        if (media === DESKTOP_QUERY) change.removeEventListener(name, listener);
      },
    }),
  });
  Element.prototype.scrollIntoView = vi.fn();
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: {
      getCurrentPosition: (yes: PositionCallback) => {
        success = yes;
      },
    },
  });
});
afterEach(() => {
  cleanup();
  resetNearbyOriginStore();
  history.replaceState(null, "", "/");
});
const options = [{ value: "jug", label: "Zavetišče Jug", city: "Ljubljana" }];
function Reader() {
  const origin = useNearbyOrigin();
  return <output data-testid="origin">{origin?.source ?? "none"}</output>;
}
function Pair({ showDesktop = true }: { showDesktop?: boolean }) {
  const props = {
    options,
    counts: new Map([["jug", 1]]),
    selected: [],
    onToggle: vi.fn(),
    onToggleMany: vi.fn(),
    resultCount: 1,
  };
  return (
    <I18nProvider locale="sl">
      {showDesktop && <LocationPicker {...props} deepLink="desktop" />}
      <LocationPicker {...props} deepLink="mobile" />
      <Reader />
    </I18nProvider>
  );
}
function resize(next: boolean) {
  act(() => {
    desktop = next;
    change.dispatchEvent(Object.assign(new Event("change"), { matches: next }));
  });
}
describe("responsive picker session", () => {
  it("shares the granted toggle, closes on breakpoint change, and opens only one spotlight", async () => {
    render(<Pair />);
    fireEvent.click(screen.getAllByRole("button", { name: /Zavetišče:/ })[1]);
    fireEvent.click(screen.getByRole("button", { name: "Najbližje prvo" }));
    act(() =>
      success({
        coords: { latitude: 46, longitude: 15 },
      } as GeolocationPosition),
    );
    expect(screen.getByTestId("origin").textContent).toBe("geolocation");
    resize(true);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(history.state?.locationPicker).toBeUndefined());
    act(() =>
      window.dispatchEvent(
        new CustomEvent(SHELTER_SPOTLIGHT_EVENT, {
          detail: { shelterId: "jug" },
        }),
      ),
    );
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(
      screen
        .getByRole("button", { name: "Najbližje prvo" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    resize(false);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
  it("retains a confirmed place when the sidebar disappears for a sparse species", () => {
    const view = render(<Pair />);
    fireEvent.click(screen.getAllByRole("button", { name: /Zavetišče:/ })[0]);
    fireEvent.change(screen.getByLabelText("Kraj, pošta ali zavetišče"), {
      target: { value: "1000" },
    });
    expect(screen.getByTestId("origin").textContent).toBe("none");
    fireEvent.click(
      screen.getByRole("button", { name: /^V bližini Ljubljana/ }),
    );
    expect(screen.getByTestId("origin").textContent).toBe("typed");
    view.rerender(<Pair showDesktop={false} />);
    expect(screen.getByTestId("origin").textContent).toBe("typed");
    fireEvent.click(screen.getByRole("button", { name: /Zavetišče:/ }));
    expect(
      (screen.getByLabelText("Kraj, pošta ali zavetišče") as HTMLInputElement)
        .value,
    ).toBe("1000");
    expect(
      screen.getByRole("button", { name: "Odstrani izhodišče" }).textContent,
    ).toContain("Ljubljana");
  });
  it("shares a confirmed place across breakpoints and clears it from either picker", async () => {
    render(<Pair />);
    fireEvent.click(screen.getAllByRole("button", { name: /Zavetišče:/ })[1]);
    fireEvent.change(screen.getByLabelText("Kraj, pošta ali zavetišče"), {
      target: { value: "1000" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /^V bližini Ljubljana/ }),
    );
    // A shelter-name search must not silently replace the chosen origin.
    fireEvent.change(screen.getByLabelText("Kraj, pošta ali zavetišče"), {
      target: { value: "Jug" },
    });
    expect(screen.getByTestId("origin").textContent).toBe("typed");

    resize(true);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    fireEvent.click(screen.getAllByRole("button", { name: /Zavetišče:/ })[0]);
    expect(
      (screen.getByLabelText("Kraj, pošta ali zavetišče") as HTMLInputElement)
        .value,
    ).toBe("1000");
    fireEvent.click(
      screen.getByRole("button", { name: "Odstrani izhodišče" }),
    );
    expect(screen.getByTestId("origin").textContent).toBe("none");

    resize(false);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    fireEvent.click(screen.getAllByRole("button", { name: /Zavetišče:/ })[1]);
    expect(
      screen.queryByRole("button", { name: "Odstrani izhodišče" }),
    ).toBeNull();
    expect(
      (screen.getByLabelText("Kraj, pošta ali zavetišče") as HTMLInputElement)
        .value,
    ).toBe("");
    expect(screen.getByTestId("origin").textContent).toBe("none");
  });
});
