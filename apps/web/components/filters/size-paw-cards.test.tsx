// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { PawPrint } from "lucide-react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type { AnimalSize } from "@posvoji/schema";
import { I18nProvider } from "@/components/i18n-provider";
import { EMPTY_FILTERS, facetCounts, groupOptions } from "@/lib/filters";
import { pointer, pointerOff, pointerOnto } from "@/test/pointer";
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
          filters={{ ...EMPTY_FILTERS, size: selected as AnimalSize[] }}
          groups={[{ group, options }]}
          counts={{ ...facetCounts([], EMPTY_FILTERS, new Date()), size: counts }}
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

const press = (element: HTMLElement, type: "pointerdown" | "pointerup") =>
  pointer(element, type, { x: 0, y: 0, pointerType: "mouse" });

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

  it("draws the paw with the shapes lucide's PawPrint is drawn from", () => {
    // The toes are copied out of lucide so they can spread on a landing. A
    // lucide upgrade that redraws the paw has to fail here rather than leave
    // this section drawing last year's icon. The small paw's toes are dots of
    // a radius of their own (the next describe), so the radius is compared
    // for the other two.
    const shapes = (svg: Element | null) =>
      [...(svg?.children ?? [])].map((shape) =>
        [
          shape.tagName,
          ...["cx", "cy", "d"].map((name) => shape.getAttribute(name)),
        ].join(" "),
      );
    const radii = (svg: Element | null) =>
      [...(svg?.querySelectorAll("circle") ?? [])].map((toe) =>
        toe.getAttribute("r"),
      );
    const lucide = render(<PawPrint />);
    const lucidePaw = lucide.container.querySelector("svg");
    const drawn = shapes(lucidePaw);
    const drawnRadii = radii(lucidePaw);
    cleanup();

    renderCards();

    expect(drawn.length).toBeGreaterThan(0);
    for (const { label, value } of options) {
      const button = screen.getByRole("button", {
        name: new RegExp(`^${label}, `),
      });
      const paw = button.querySelector("svg.lucide-paw-print");
      expect(shapes(paw)).toEqual(drawn);
      if (value !== "small") expect(radii(paw)).toEqual(drawnRadii);
    }
  });

  it("leaves a print where a paw was taken off", () => {
    function Harness() {
      const [selected, setSelected] = useState([options[0].value]);
      return (
        <I18nProvider locale="sl">
          <SizePawCards
            options={options}
            counts={counts}
            selected={selected}
            onToggle={(value) =>
              setSelected((current) =>
                current.includes(value)
                  ? current.filter((item) => item !== value)
                  : [...current, value],
              )
            }
          />
        </I18nProvider>
      );
    }
    render(<Harness />);
    const button = screen.getByRole("button", {
      name: new RegExp(`^${options[0].label}, `),
    });
    const prints = () =>
      button.querySelectorAll('svg.lucide-paw-print[fill="currentColor"]');
    expect(prints()).toHaveLength(0);

    fireEvent.click(button);

    expect(button.getAttribute("aria-pressed")).toBe("false");
    expect(prints()).toHaveLength(1);
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

    press(button, "pointerdown");
    press(button, "pointerup");
    fireEvent.click(button);

    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledWith(options[1].value);
  });

  it("leaves a card functional for a later click after pointerdown then pointerleave with no click", () => {
    const onToggle = renderCards();
    const button = screen.getByRole("button", {
      name: new RegExp(`^${options[2].label}, `),
    });

    press(button, "pointerdown");
    pointerOff(button);
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

describe("SizePawCards under the pointer", () => {
  const tipped = (label: string) =>
    screen
      .getByRole("button", { name: new RegExp(`^${label}, `) })
      .querySelector("[data-tipped]") !== null;

  it("tips the paw onto its heel under a mouse and not under a finger", () => {
    renderCards();
    const card = screen.getByRole("button", {
      name: new RegExp(`^${options[1].label}, `),
    });

    pointerOnto(card, "touch");
    expect(tipped(options[1].label)).toBe(false);

    pointerOnto(card, "mouse");
    expect(tipped(options[1].label)).toBe(true);
  });

  // Why: the comment on `tipped` in size-paw-cards.tsx.
  it("stands the paw flat from a click until the pointer leaves", async () => {
    renderCards();
    const card = screen.getByRole("button", {
      name: new RegExp(`^${options[1].label}, `),
    });

    pointerOnto(card, "mouse");
    expect(tipped(options[1].label)).toBe(true);

    fireEvent.click(card);
    await waitFor(() => expect(tipped(options[1].label)).toBe(false));

    pointerOff(card);
    pointerOnto(card, "mouse");
    expect(tipped(options[1].label)).toBe(true);
  });

  it("stands the paw flat while it is held down", () => {
    renderCards();
    const card = screen.getByRole("button", {
      name: new RegExp(`^${options[2].label}, `),
    });

    pointerOnto(card, "mouse");
    press(card, "pointerdown");
    expect(tipped(options[2].label)).toBe(false);
  });
});

describe("SizePawCards line weight", () => {
  // Why: PAW_STROKE_PX in size-paw-cards.tsx.
  it.each(["sidebar", "sheet"] as const)(
    "draws every paw's outline at one width on screen in the %s",
    (layout) => {
      renderCards({ layout });

      const widths = options.map(({ label }) => {
        const paw = screen
          .getByRole("button", { name: new RegExp(`^${label}, `) })
          .querySelector<SVGSVGElement>(
            'svg.lucide-paw-print:not(.size-12):not([fill="currentColor"])',
          );
        const size = /(?:^|\s)size-(\d+)(?:\s|$)/.exec(
          paw?.getAttribute("class") ?? "",
        );
        expect(size).not.toBeNull();
        const px = Number(size?.[1]) * 4;
        return (Number(paw?.getAttribute("stroke-width")) * px) / 24;
      });

      expect(new Set(widths.map((width) => width.toFixed(3))).size).toBe(1);
      // Three sizes, or the check above compares one paw with itself.
      expect(options).toHaveLength(3);
    },
  );
});

// The drawn size of a paw, in px, from the size-N class it is drawn at.
function pawPx(paw: Element | null): number {
  const size = /(?:^|\s)size-(\d+)(?:\s|$)/.exec(
    paw?.getAttribute("class") ?? "",
  );
  if (!size) throw new Error("no size class on the paw");
  return Number(size[1]) * 4;
}

describe("SizePawCards small toes", () => {
  // Where the pad's outline passes nearest each toe, in the 24-unit box: the
  // top arc (centre (9, 15), radius 5) under the two upper toes, the right
  // side (x = 14) beside the lowest. The drift test above holds the pad to
  // lucide's, so these hold while it passes.
  const toArc = (x: number, y: number) => Math.hypot(x - 9, y - 15) - 5;
  const toPad: ((x: number, y: number) => number)[] = [
    toArc,
    toArc,
    (x) => x - 14,
  ];

  // Why: TOE_DOT_RADIUS in size-paw-cards.tsx. Stroked, the toes stood 0.65 to
  // 0.85px off the pad and off each other at 12px, and printed as one blob.
  it.each(["sidebar", "sheet"] as const)(
    "leaves a pixel of daylight round each of the small paw's toes in the %s",
    (layout) => {
      renderCards({ layout });
      const paw = screen
        .getByRole("button", { name: /^Majhna, / })
        .querySelector(
          'svg.lucide-paw-print:not(.size-12):not([fill="currentColor"])',
        );
      const px = pawPx(paw) / 24;
      const outline = Number(paw?.getAttribute("stroke-width")) / 2;
      const toes = [...(paw?.querySelectorAll("circle") ?? [])].map((toe) => ({
        x: Number(toe.getAttribute("cx")),
        y: Number(toe.getAttribute("cy")),
        // A dot is its radius wide; a ring reaches half its stroke further.
        reach:
          Number(toe.getAttribute("r")) +
          (toe.getAttribute("stroke") === "none" ? 0 : outline),
        filled: toe.getAttribute("fill") === "currentColor",
      }));

      expect(toes).toHaveLength(3);
      expect(toes.every((toe) => toe.filled)).toBe(true);
      const gaps = [
        ...toes.map(
          (toe, index) => toPad[index](toe.x, toe.y) - outline - toe.reach,
        ),
        ...[
          [0, 1],
          [1, 2],
        ].map(
          ([a, b]) =>
            Math.hypot(toes[a].x - toes[b].x, toes[a].y - toes[b].y) -
            toes[a].reach -
            toes[b].reach,
        ),
      ].map((units) => units * px);
      for (const gap of gaps) expect(gap).toBeGreaterThanOrEqual(1);
    },
  );

  it("keeps the stroked toes on the paws big enough for them", () => {
    renderCards();

    for (const label of ["Srednja", "Velika"]) {
      const toes = screen
        .getByRole("button", { name: new RegExp(`^${label}, `) })
        .querySelectorAll("svg.lucide-paw-print circle");
      for (const toe of toes) expect(toe.getAttribute("fill")).toBeNull();
    }
  });
});

describe("SizePawCards landing shadow", () => {
  function Harness() {
    const [selected, setSelected] = useState<string[]>([]);
    return (
      <I18nProvider locale="sl">
        <SizePawCards
          options={options}
          counts={counts}
          selected={selected}
          onToggle={(value) =>
            setSelected((current) =>
              current.includes(value)
                ? current.filter((item) => item !== value)
                : [...current, value],
            )
          }
        />
      </I18nProvider>
    );
  }

  // It was 16px under every paw, 21px at the impact under the small one's 12.
  it("sizes the shadow with the paw that lands on it", () => {
    render(<Harness />);

    const shadows = options.map(({ label }) => {
      const button = screen.getByRole("button", {
        name: new RegExp(`^${label}, `),
      });
      fireEvent.click(button);
      const shadow = button.querySelector<HTMLElement>("[data-landing-shadow]");
      const px = pawPx(button.querySelector("svg.lucide-paw-print"));
      return {
        px,
        width: parseFloat(shadow?.style.width ?? ""),
        height: parseFloat(shadow?.style.height ?? ""),
        bottom: parseFloat(shadow?.style.bottom ?? ""),
      };
    });

    for (const { px, width, height, bottom } of shadows) {
      expect(width / px).toBeCloseTo(0.8);
      expect(height / px).toBeCloseTo(0.2);
      // Centred on the paw's foot, the bottom of its box.
      expect(bottom).toBeCloseTo(-height / 2);
    }
    // The large paw keeps the shadow it always had.
    expect(shadows.at(-1)).toMatchObject({ px: 20, width: 16, height: 4 });
  });
});
