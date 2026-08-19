// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AnimalSize } from "@posvoji/schema";
import { I18nProvider } from "@/components/i18n-provider";
import { groupOptions } from "@/lib/filters";
import { FilterGroupList, type CardGroup } from "./filter-groups";
import { SizePawCards } from "./size-paw-cards";

afterEach(() => cleanup());

const options = groupOptions("size", [], "sl");
const counts = new Map(options.map(({ value }) => [value, 3]));

function renderCards(overrides: {
  counts?: Map<string, number>;
  selected?: string[];
  onToggle?: (value: string) => void;
  isResetting?: boolean;
} = {}) {
  const onToggle = overrides.onToggle ?? vi.fn();
  render(
    <I18nProvider locale="sl">
      <SizePawCards
        options={options}
        counts={overrides.counts ?? counts}
        selected={overrides.selected ?? []}
        onToggle={onToggle}
        isResetting={overrides.isResetting}
      />
    </I18nProvider>,
  );
  return onToggle;
}

describe("SizePawCards", () => {
  it("renders one card per option with its label, count and aria-label", () => {
    renderCards();

    for (const { label, value } of options) {
      const count = counts.get(value) ?? 0;
      const button = screen.getByRole("button", {
        name: new RegExp(`^${label}, `),
      });
      expect(button.textContent).toContain(label);
      expect(button.textContent).toContain(String(count));
    }
  });

  it("reflects selection through aria-pressed", () => {
    renderCards({ selected: [options[0].value] });

    const buttons = screen.getAllByRole("button");
    expect(buttons[0].getAttribute("aria-pressed")).toBe("true");
    expect(buttons[1].getAttribute("aria-pressed")).toBe("false");
    expect(buttons[2].getAttribute("aria-pressed")).toBe("false");
  });

  it("calls onToggle with the option's value when an unchecked card is clicked", () => {
    const onToggle = renderCards();

    fireEvent.click(
      screen.getByRole("button", { name: new RegExp(`^${options[1].label}, `) }),
    );

    expect(onToggle).toHaveBeenCalledWith(options[1].value);
  });

  it("calls onToggle again when a checked card is clicked, to deselect it", () => {
    const onToggle = renderCards({ selected: [options[0].value] });

    fireEvent.click(
      screen.getByRole("button", { name: new RegExp(`^${options[0].label}, `) }),
    );

    expect(onToggle).toHaveBeenCalledWith(options[0].value);
  });

  it("disables an unchecked option with a zero count", () => {
    const zeroCounts = new Map(options.map(({ value }) => [value, 0]));
    renderCards({ counts: zeroCounts });

    for (const { label } of options) {
      const button = screen.getByRole("button", {
        name: new RegExp(`^${label}, `),
      }) as HTMLButtonElement;
      expect(button.disabled).toBe(true);
    }
  });

  it("keeps a checked option enabled even at a zero count", () => {
    const zeroCounts = new Map(options.map(({ value }) => [value, 0]));
    renderCards({ counts: zeroCounts, selected: [options[0].value] });

    const checkedButton = screen.getByRole("button", {
      name: new RegExp(`^${options[0].label}, `),
    }) as HTMLButtonElement;
    const uncheckedButton = screen.getByRole("button", {
      name: new RegExp(`^${options[1].label}, `),
    }) as HTMLButtonElement;
    expect(checkedButton.disabled).toBe(false);
    expect(uncheckedButton.disabled).toBe(true);
  });
});

describe("size section reset", () => {
  function renderSizeGroup(selected: string[]) {
    const onToggle = vi.fn();
    const onToggleMany = vi.fn();
    const group: CardGroup = "size";

    render(
      <I18nProvider locale="sl">
        <FilterGroupList
          filters={{
            species: "all",
            sex: [],
            age: [],
            size: selected as AnimalSize[],
            energy: [],
            shelter: [],
            toggles: [],
            goodWith: [],
          }}
          groups={[{ group, options }]}
          counts={{
            sex: new Map(),
            age: new Map(),
            size: counts,
            energy: new Map(),
            shelter: new Map(),
          }}
          toggles={[]}
          toggleTally={new Map()}
          onToggle={(_group, value) => onToggle(value)}
          onToggleMany={(_group, values) => onToggleMany(values)}
          onToggleProperty={() => undefined}
          onToggleManyProperties={() => undefined}
        />
      </I18nProvider>,
    );
    return { onToggle, onToggleMany };
  }

  it("calls onToggleMany with the selected values when the section reset is clicked", () => {
    const selected = [options[0].value, options[1].value];
    const { onToggleMany } = renderSizeGroup(selected);

    fireEvent.click(
      screen.getByRole("button", { name: "Ponastavi filter velikosti" }),
    );

    expect(onToggleMany).toHaveBeenCalledWith(selected);
  });
});

// jsdom has no PointerEvent, so pointer gestures are built on MouseEvent by
// hand, dispatched under the pointer event name. React listens by event
// name, so the onPointer* handlers still receive these even though the
// event object itself is not a real PointerEvent.
function pointer(
  element: HTMLElement,
  type: "pointerdown" | "pointerup" | "pointerleave" | "pointercancel",
) {
  fireEvent(element, new MouseEvent(type, { bubbles: true, cancelable: true }));
}

describe("SizePawCards watermark", () => {
  it("gives every card an aria-hidden watermark paw that does not carry the card's label", () => {
    renderCards();

    for (const { label } of options) {
      const button = screen.getByRole("button", {
        name: new RegExp(`^${label}, `),
      });
      const watermark = button.querySelector("svg.size-12");
      expect(watermark).not.toBeNull();

      const host = watermark?.closest("[aria-hidden]");
      expect(host).not.toBeNull();
      expect(host?.textContent ?? "").not.toContain(label);
    }
  });
});

describe("SizePawCards sleeping paw", () => {
  it("tips over the paw of a dead, unchecked, zero-count card", () => {
    const zeroCounts = new Map(options.map(({ value }) => [value, 0]));
    renderCards({ counts: zeroCounts });

    const deadButton = screen.getByRole("button", {
      name: new RegExp(`^${options[0].label}, `),
    });
    const deadIcon = deadButton.querySelector(
      "svg.lucide-paw-print:not(.size-12)",
    );
    expect(deadIcon?.getAttribute("class")).toContain("rotate-[20deg]");
    expect(deadIcon?.getAttribute("class")).toContain("opacity-80");
  });

  it("leaves a live card's paw without the tipped-over posture", () => {
    renderCards();

    const liveButton = screen.getByRole("button", {
      name: new RegExp(`^${options[0].label}, `),
    });
    const liveIcon = liveButton.querySelector(
      "svg.lucide-paw-print:not(.size-12)",
    );
    expect(liveIcon?.getAttribute("class")).not.toContain("rotate-[20deg]");
  });
});

describe("SizePawCards press-crouch", () => {
  it("still calls onToggle exactly once with the value after pointerdown, pointerup, then click", () => {
    const onToggle = renderCards();
    const button = screen.getByRole("button", {
      name: new RegExp(`^${options[1].label}, `),
    });

    pointer(button, "pointerdown");
    pointer(button, "pointerup");
    fireEvent.click(button);

    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledWith(options[1].value);
  });

  it("leaves a card functional for a later click after pointerdown then pointerleave with no click", () => {
    const onToggle = renderCards();
    const button = screen.getByRole("button", {
      name: new RegExp(`^${options[2].label}, `),
    });

    pointer(button, "pointerdown");
    pointer(button, "pointerleave");
    fireEvent.click(button);

    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledWith(options[2].value);
  });
});

describe("SizePawCards under reduced motion", () => {
  it("renders and toggles without errors when the user prefers reduced motion", () => {
    const originalMatchMedia = window.matchMedia;
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockImplementation((media: string) => ({
        matches: media === "(prefers-reduced-motion: reduce)",
        media,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });

    try {
      const onToggle = renderCards();

      fireEvent.click(
        screen.getByRole("button", {
          name: new RegExp(`^${options[0].label}, `),
        }),
      );

      expect(onToggle).toHaveBeenCalledWith(options[0].value);
    } finally {
      Object.defineProperty(window, "matchMedia", {
        configurable: true,
        value: originalMatchMedia,
      });
    }
  });
});
