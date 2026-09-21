// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AnimalSize } from "@posvoji/schema";
import { I18nProvider } from "@/components/i18n-provider";
import { groupOptions } from "@/lib/filters";
import {
  installFilterFoldSeams,
  openFilterSection,
} from "@/test/filter-folds";
import { FilterGroupList, type CardGroup } from "./filter-groups";
import { SizePawCards } from "./size-paw-cards";

installFilterFoldSeams();

const options = groupOptions("size", [], "sl");
const counts = new Map(options.map(({ value }) => [value, 3]));

function renderCards(overrides: {
  counts?: Map<string, number>;
  selected?: string[];
  onToggle?: (value: string) => void;
  isResetting?: boolean;
  layout?: "sidebar" | "sheet";
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
        layout={overrides.layout}
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
            coatColor: [],
            coatLength: [],
            waiting: [],
            shelter: [],
            toggles: [],
            goodWith: [],
            home: [],
            care: [],
          }}
          groups={[{ group, options }]}
          counts={{
            sex: new Map(),
            age: new Map(),
            size: counts,
            energy: new Map(),
            coatColor: new Map(),
            coatLength: new Map(),
            waiting: new Map(),
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

    openFilterSection("Velikost");
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
  it("gives every sheet tile an aria-hidden watermark paw that does not carry the card's label", () => {
    renderCards({ layout: "sheet" });

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

  // The watermark is a stamp on a card ground, and a sidebar row has no
  // ground: it would land behind the count as a smudge rather than in an
  // empty corner. The row says "chosen" with the green fill and the check,
  // like every other row in that column.
  it("leaves the watermark off a sidebar row", () => {
    renderCards();

    for (const { label } of options) {
      const button = screen.getByRole("button", {
        name: new RegExp(`^${label}, `),
      });
      expect(button.querySelector("svg.size-12")).toBeNull();
      // The paw itself stays. Quieting the surface never takes the drawing.
      expect(button.querySelector("svg.lucide-paw-print")).not.toBeNull();
    }
  });

  // The row treatment filter-card.tsx describes: a transparent border, no
  // ground and no shadow at rest, on the 40px line the column keeps. The
  // tile's own surface has to be absent, not merely overridden: while it was
  // both, the stylesheet order decided and the row kept the box.
  it("draws a sidebar row on the shared row surface", () => {
    renderCards();

    for (const { label } of options) {
      const button = screen.getByRole("button", {
        name: new RegExp(`^${label}, `),
      });
      expect(button.className).toContain("border-transparent");
      expect(button.className).toContain("bg-transparent");
      expect(button.className).toContain("shadow-none");
      expect(button.className).toContain("h-10");
      expect(button.className).not.toContain("h-11");
      expect(button.className).not.toContain("shadow-xs");
      expect(button.className).not.toContain("border-border/80");
      expect(button.className).not.toContain("bg-background");
      expect(button.className).not.toContain("min-h-[4.75rem]");
    }
  });

  // The fill is the row's whole answer to "chosen", so losing it left the
  // check and the green lettering saying it alone.
  it("fills a chosen sidebar row", () => {
    renderCards({ selected: [options[0].value] });

    const button = screen.getByRole("button", {
      name: new RegExp(`^${options[0].label}, `),
    });
    expect(button.className).toContain("bg-brand");
    expect(button.className).not.toContain("bg-transparent");
  });
});

describe("SizePawCards sleeping paw", () => {
  it("tips over the paw of a dead, unchecked, zero-count card", () => {
    const zeroCounts = new Map(options.map(({ value }) => [value, 0]));
    renderCards({ counts: zeroCounts });

    const deadButton = screen.getByRole("button", {
      name: new RegExp(`^${options[0].label}, `),
    });
    // These render at the sidebar default, where there is no watermark paw to
    // tell the real one apart from, so the selector says only what it means.
    const deadIcon = deadButton.querySelector("svg.lucide-paw-print");
    expect(deadIcon?.getAttribute("class")).toContain("rotate-[20deg]");
    expect(deadIcon?.getAttribute("class")).toContain("opacity-80");
  });

  it("leaves a live card's paw without the tipped-over posture", () => {
    renderCards();

    const liveButton = screen.getByRole("button", {
      name: new RegExp(`^${options[0].label}, `),
    });
    const liveIcon = liveButton.querySelector("svg.lucide-paw-print");
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
