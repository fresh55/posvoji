// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/components/i18n-provider";
import { resetNearbyOriginStore } from "@/hooks/use-nearby-origin";
import type { AnimalSort } from "@/lib/sort";
import { resetPickerSession, stubScrollIntoView } from "@/test/location-picker";
import { LocationPicker } from "./location-picker";
// The dialog is a lazy chunk. Loaded here, before any test presses the
// trigger, so no press waits on a transform inside its own act.
import "./location-picker/view";

beforeEach(() => {
  resetNearbyOriginStore();
  history.replaceState(null, "", "/");
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (media: string) => ({
      matches: false,
      media,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });
  stubScrollIntoView();
});

afterEach(() => {
  resetPickerSession();
  history.replaceState(null, "", "/");
});

const options = [{ value: "jug", label: "Zavetišče Jug", city: "Ljubljana" }];

function Picker({
  sort,
  onSortChange,
}: {
  sort?: AnimalSort;
  onSortChange?: (sort: AnimalSort) => void;
}) {
  return (
    <I18nProvider locale="sl">
      <LocationPicker
        options={options}
        counts={new Map([["jug", 1]])}
        selected={[]}
        onToggle={vi.fn()}
        onToggleMany={vi.fn()}
        resultCount={1}
        deepLink="mobile"
        sort={sort}
        onSortChange={onSortChange}
      />
    </I18nProvider>
  );
}

async function setPlace() {
  fireEvent.click(screen.getByRole("button", { name: /Zavetišče:/ }));
  await screen.findByRole("dialog", {}, { timeout: 5000 });
  fireEvent.change(screen.getByLabelText("Kraj, pošta ali zavetišče"), {
    target: { value: "1000" },
  });
  fireEvent.click(
    await screen.findByRole("button", { name: /^V bližini Ljubljana/ }),
  );
}

describe("ordering the grid by distance from the picker", () => {
  it("offers it once a place is set, and only then", async () => {
    const onSortChange = vi.fn();
    render(<Picker sort="longest-in-shelter" onSortChange={onSortChange} />);
    fireEvent.click(screen.getByRole("button", { name: /Zavetišče:/ }));
    await screen.findByRole("dialog", {}, { timeout: 5000 });
    expect(
      screen.queryByRole("button", { name: "Razvrsti živali po bližini" }),
    ).toBeNull();

    fireEvent.change(screen.getByLabelText("Kraj, pošta ali zavetišče"), {
      target: { value: "1000" },
    });
    fireEvent.click(
      await screen.findByRole("button", { name: /^V bližini Ljubljana/ }),
    );
    const offer = screen.getByRole("button", { name: "Razvrsti živali po bližini" });
    // Offered and not done: an order the visitor chose stays theirs.
    expect(offer.getAttribute("aria-pressed")).toBe("false");
    expect(onSortChange).not.toHaveBeenCalled();

    fireEvent.click(offer);
    expect(onSortChange).toHaveBeenLastCalledWith("nearest");
  });

  it("gives back the order the grid had before the first press", async () => {
    const orders: AnimalSort[] = [];
    function Sorted() {
      const [sort, setSort] = useState<AnimalSort>("name");
      return (
        <Picker
          sort={sort}
          onSortChange={(next) => {
            orders.push(next);
            setSort(next);
          }}
        />
      );
    }
    render(<Sorted />);
    await setPlace();
    const offer = () =>
      screen.getByRole("button", { name: "Razvrsti živali po bližini" });

    fireEvent.click(offer());
    expect(offer().getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(offer());
    expect(orders).toEqual(["nearest", "name"]);
    expect(offer().getAttribute("aria-pressed")).toBe("false");
  });

  it("gives the default order back when the grid came in by distance", async () => {
    const onSortChange = vi.fn();
    render(<Picker sort="nearest" onSortChange={onSortChange} />);
    await setPlace();
    const offer = screen.getByRole("button", { name: "Razvrsti živali po bližini" });
    expect(offer.getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(offer);
    expect(onSortChange).toHaveBeenLastCalledWith("longest-in-shelter");
  });

  it("offers nothing where the picker has no grid order to change", async () => {
    render(<Picker />);
    await setPlace();
    expect(
      screen.queryByRole("button", { name: "Razvrsti živali po bližini" }),
    ).toBeNull();
  });
});
