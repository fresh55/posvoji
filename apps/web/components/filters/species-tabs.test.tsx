// @vitest-environment jsdom

import { type ComponentProps } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Cat, Dog, Rabbit } from "lucide-react";
import { I18nProvider } from "@/components/i18n-provider";
import { SpeciesTabs } from "./species-tabs";

afterEach(() => cleanup());

// No filters on in this harness, so the roster and the tally are the same
// numbers; the one test that needs them apart says so.
const TALLY = { all: 4, dog: 1, cat: 1, other: 2 };

type TabsProps = Partial<ComponentProps<typeof SpeciesTabs>>;

function renderTabs(overrides: TabsProps = {}) {
  const onChange = overrides.onChange ?? vi.fn();
  const result = render(
    <I18nProvider locale="en">
      <SpeciesTabs
        value="all"
        counts={TALLY}
        roster={TALLY}
        {...overrides}
        onChange={onChange}
      />
    </I18nProvider>,
  );
  return { ...result, onChange };
}

function tab(name: string) {
  return screen.getByRole("button", { name: new RegExp(`^${name}`) });
}

/** Every outline a subtree draws, in the order it draws them. */
function pathData(root: Element) {
  return Array.from(root.querySelectorAll("path")).map((path) =>
    path.getAttribute("d"),
  );
}

// The label the tab carries in English, and the lucide icon its drawing is
// copied from. "Other" wears the rabbit; see SPECIES_GLYPHS.
const SPECIES = [
  { name: "Dogs", Icon: Dog },
  { name: "Cats", Icon: Cat },
  { name: "Other", Icon: Rabbit },
] as const;

describe("SpeciesTabs", () => {
  it("renders the way back and every species the dataset holds, each with its count", () => {
    renderTabs({ value: "cat" });

    for (const [name, count] of [
      ["All", 4],
      ["Dogs", 1],
      ["Cats", 1],
      ["Other", 2],
    ] as const) {
      expect(tab(name).textContent).toContain(String(count));
    }

    expect(tab("Cats").getAttribute("aria-pressed")).toBe("true");
    for (const name of ["All", "Dogs", "Other"]) {
      expect(tab(name).getAttribute("aria-pressed")).toBe("false");
    }
  });

  it("reports the pressed tab, including the one that was already pressed", () => {
    const { onChange } = renderTabs({ value: "dog" });

    fireEvent.click(tab("Cats"));
    expect(onChange).toHaveBeenCalledWith("cat");

    // Pressing the pressed tab is not a no-op here: the tabs are controlled,
    // and the caller is the one that decides there is nothing to do.
    fireEvent.click(tab("Dogs"));
    expect(onChange).toHaveBeenLastCalledWith("dog");
  });

  it("drops a species the dataset does not hold", () => {
    renderTabs({ roster: { all: 2, dog: 1, cat: 1, other: 0 } });

    expect(screen.queryByRole("button", { name: /^Other/ })).toBeNull();
    expect(tab("Dogs")).toBeTruthy();
  });

  it("keeps every tab, disabled, when there is no dataset at all", () => {
    renderTabs({
      disabled: true,
      counts: { all: 0, dog: 0, cat: 0, other: 0 },
      roster: { all: 0, dog: 0, cat: 0, other: 0 },
    });

    for (const name of ["All", "Dogs", "Cats", "Other"]) {
      // No counts are drawn while disabled, so the name is the label alone.
      const button = screen.getByRole("button", { name });
      expect(button.hasAttribute("disabled")).toBe(true);
    }
    // The fill dims with the tabs it stands under.
    expect(
      document.querySelector('[data-slot="species-fill"]')?.className,
    ).toContain("opacity-50");
  });

  it("hands the pressed tab's background to the one fill in the row", () => {
    renderTabs({ value: "cat" });

    const active = tab("Cats");
    const row = active.parentElement as HTMLElement;
    expect(row.querySelectorAll('[data-slot="species-fill"]').length).toBe(1);

    // The tab keeps the light label and gives up the dark ground, which is
    // the fill's job from hydration on.
    expect(active.className).toContain("text-background");
    expect(active.className).not.toContain("bg-foreground");

    const inactive = tab("Dogs");
    expect(inactive.className).not.toContain("text-background");
    expect(inactive.className).not.toContain("bg-foreground");
  });

  it("draws each species with the paths its lucide icon is drawn from", () => {
    // The paths are copied into animal-glyph-paths.ts so they can be inked
    // in. A lucide upgrade that redraws an animal has to fail here rather
    // than leave the tabs drawing last year's icon, and because the "dobro z"
    // cards read the dog and the cat from that same module, this guards their
    // drawing too.
    const lucide = render(
      <div>
        {SPECIES.map(({ name, Icon }) => (
          <span key={name} data-icon={name}>
            <Icon />
          </span>
        ))}
      </div>,
    );
    const drawn = new Map(
      SPECIES.map(({ name }) => [
        name,
        pathData(
          lucide.container.querySelector(`[data-icon="${name}"]`) as Element,
        ),
      ]),
    );
    cleanup();

    renderTabs();

    for (const { name } of SPECIES) {
      expect(drawn.get(name)?.length).toBeGreaterThan(0);
      expect(pathData(tab(name))).toEqual(drawn.get(name));
    }
    // The way back is a word, not an animal.
    expect(pathData(tab("All"))).toEqual([]);
  });

  it("keeps the label the first span in every tab", () => {
    // The glyph is the svg itself and the fill lives in the row, so nothing
    // is drawn in a span ahead of the label. Other tests read the label off
    // a tab by asking for its first one.
    renderTabs({ value: "dog" });

    for (const name of ["All", "Dogs", "Cats", "Other"]) {
      const label = tab(name).querySelector("span");
      expect(label?.textContent).toBe(name);
      expect(label?.className).toContain("truncate");
    }
  });

  it("restarts the glyph of the species that was pressed, drawing the same animal", () => {
    renderTabs({ value: "all" });

    const dogs = tab("Dogs");
    const before = dogs.querySelector("svg");
    const drawnBefore = pathData(dogs);
    const catGlyphBefore = tab("Cats").querySelector("svg");

    fireEvent.click(dogs);

    // A beat is a remount, which is what lets the outline ink in again from
    // nothing. The animal it inks in is the same one.
    expect(dogs.querySelector("svg")).not.toBe(before);
    expect(pathData(dogs)).toEqual(drawnBefore);
    // And it is the pressed tab alone that moves: the cat keeps the very
    // glyph it had, not merely one that looks like it.
    expect(tab("Cats").querySelector("svg")).toBe(catGlyphBefore);
  });

  it("does not beat for Vse, which has no animal to move", () => {
    renderTabs({ value: "dog" });

    const all = tab("All");
    const dogGlyph = tab("Dogs").querySelector("svg");

    fireEvent.click(all);

    expect(all.querySelector("svg")).toBeNull();
    expect(tab("Dogs").querySelector("svg")).toBe(dogGlyph);
  });

  it("does not beat when the pressed tab is the one already pressed", () => {
    renderTabs({ value: "cat" });

    const cats = tab("Cats");
    const before = cats.querySelector("svg");

    fireEvent.click(cats);

    expect(cats.querySelector("svg")).toBe(before);
  });
});
