// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/components/i18n-provider";
import { FILTER_FACETS } from "@/lib/filters";
import { FilterChips, type Chip } from "./filter-chips";

afterEach(() => cleanup());

function chip(partial: Partial<Chip> & { key: string; label: string }): Chip {
  return { facet: "sex", value: partial.key, onRemove: vi.fn(), ...partial };
}

function renderChips(chips: Chip[], props: Partial<Parameters<typeof FilterChips>[0]> = {}) {
  return render(
    <I18nProvider locale="en">
      <FilterChips chips={chips} onClearAll={vi.fn()} {...props} />
    </I18nProvider>,
  );
}

function pills() {
  return screen
    .getByRole("toolbar")
    .querySelectorAll<HTMLButtonElement>("button");
}

describe("the active filters row", () => {
  const glyphOf = (button: HTMLElement) =>
    button.querySelector("svg")?.getAttribute("class");

  it("gives each pill the mark its own card wore, not one mark per facet", () => {
    // Drawing the facet gave Samec and Samica the same symbol, and Mladiček
    // and Odrasel another same symbol: two pairs of pills that had to be read
    // word by word, each disagreeing with the card just pressed.
    renderChips([
      chip({ key: "sex:male", facet: "sex", value: "male", label: "Samec" }),
      chip({ key: "sex:female", facet: "sex", value: "female", label: "Samica" }),
      chip({
        key: "age:mladicek",
        facet: "age",
        value: "mladicek",
        label: "Mladiček",
      }),
      chip({
        key: "age:odrasel",
        facet: "age",
        value: "odrasel",
        label: "Odrasel",
      }),
    ]);

    const marks = ["Samec", "Samica", "Mladiček", "Odrasel"].map((label) =>
      glyphOf(screen.getByRole("button", { name: `Remove filter ${label}` })),
    );
    expect(new Set(marks).size).toBe(4);
  });

  it("says size with the same paw at three sizes the cards use", () => {
    renderChips([
      chip({ key: "size:small", facet: "size", value: "small", label: "Majhna" }),
      chip({ key: "size:large", facet: "size", value: "large", label: "Velika" }),
    ]);

    const small = glyphOf(
      screen.getByRole("button", { name: "Remove filter Majhna" }),
    );
    const large = glyphOf(
      screen.getByRole("button", { name: "Remove filter Velika" }),
    );
    expect(small).toContain("size-2.5");
    expect(large).toContain("size-[1.125rem]");
  });

  it("falls back to the facet's mark where the answer has none of its own", () => {
    // A shelter has a name and no symbol, and a folded summary stands for
    // several answers at once.
    renderChips([
      chip({ key: "shelter:a", facet: "shelter", value: "a", label: "Mala hiša" }),
      chip({ key: "age:b", facet: "age", value: "odrasel", label: "Odrasel" }),
    ]);

    const shelter = screen.getByRole("button", {
      name: "Remove filter Mala hiša",
    });
    expect(shelter.querySelector("span")?.className).toContain(
      "filter-accent-strong",
    );
    expect(glyphOf(shelter)).not.toBe(
      glyphOf(screen.getByRole("button", { name: "Remove filter Odrasel" })),
    );
  });

  it("truncates a long shelter name instead of letting it eat the row", () => {
    const label = "Veterinarska bolnica Brežice — zavetišče";
    renderChips([chip({ key: "shelter:a", facet: "shelter", label })]);

    const text = screen
      .getByRole("button", { name: `Remove filter ${label}` })
      .querySelector("[title]");
    expect(text?.getAttribute("title")).toBe(label);
    expect(text?.className).toContain("truncate");
    expect(text?.className).toContain("max-w-");
  });

  it("draws the row in the panel's order, so two visitors with one filter state see one row", () => {
    // Ordering by when each chip appeared would have made the row a private
    // history: the same filters, a different row, depending on the path taken
    // to them. The panel's order is the one already learned from the panel.
    renderChips([
      chip({ key: "sex:a", facet: "sex", label: "Samec" }),
      chip({ key: "age:b", facet: "age", label: "Mlad" }),
      chip({ key: "care:c", facet: "care", label: "Potrpežljiv dom" }),
    ]);

    expect([...pills()].map((button) => button.textContent?.trim())).toEqual([
      "Samec",
      "Mlad",
      "Potrpežljiv dom",
      "Clear all",
    ]);
  });

  it("brings a single new pill into view, and stays put for a whole restored set", () => {
    const scrollIntoView = vi.fn();
    const original = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = scrollIntoView;

    try {
      const one = chip({ key: "sex:a", label: "Samec" });
      const two = chip({ key: "age:b", facet: "age", label: "Mlad" });
      const { rerender } = renderChips([one]);
      scrollIntoView.mockClear();

      const render2 = (chips: Chip[]) => (
        <I18nProvider locale="en">
          <FilterChips chips={chips} onClearAll={vi.fn()} />
        </I18nProvider>
      );

      // One pick, from a sheet that was covering this row: it has to be
      // visible when the sheet closes.
      rerender(render2([one, two]));
      expect(scrollIntoView).toHaveBeenCalledTimes(1);

      // Several at once is an undo or a fresh page. No single pill to point at.
      scrollIntoView.mockClear();
      rerender(render2([]));
      rerender(render2([one, two]));
      expect(scrollIntoView).not.toHaveBeenCalled();
    } finally {
      HTMLElement.prototype.scrollIntoView = original;
    }
  });

  it("folds a facet with three or more values into one pill, and unfolds it on press", () => {
    const shelters = ["Mala hiša", "Mačja hiša", "Meli"].map((label, index) =>
      chip({ key: `shelter:${index}`, facet: "shelter", label }),
    );
    renderChips(shelters);

    // One pill, carrying the first name and how many more it stands for.
    expect(screen.queryByRole("button", { name: "Remove filter Meli" })).toBeNull();
    const folded = screen.getByRole("button", { name: "Show all selected: Shelter" });
    expect(folded.textContent).toContain("Mala hiša");
    expect(folded.textContent).toContain("+2");

    fireEvent.click(folded);
    expect(screen.getByRole("button", { name: "Remove filter Meli" })).toBeTruthy();
  });

  it("puts everything past the eighth pill behind a count", () => {
    // Nine facets at two values each is eighteen pills inside a header that
    // is sticky on a phone, and two per facet is under the fold threshold,
    // so the count is the only thing bounding the row here.
    const many = FILTER_FACETS.flatMap((facet) =>
      [0, 1].map((n) => chip({ key: `${facet}:${n}`, facet, label: `${facet}${n}` })),
    );
    expect(many).toHaveLength(18);
    renderChips(many);

    expect(screen.queryByRole("button", { name: "Remove filter care1" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Show 10 more" }));
    expect(screen.getByRole("button", { name: "Remove filter care1" })).toBeTruthy();
  });

  it("walks the row with the arrow keys and removes with Delete, from one tab stop", () => {
    const onRemove = vi.fn();
    renderChips([
      chip({ key: "a", label: "Dogs" }),
      chip({ key: "b", facet: "age", label: "Cats", onRemove }),
    ]);

    const toolbar = screen.getByRole("toolbar");
    const stops = [...pills()];
    // One stop for the whole row: eight filters used to mean nine tabs
    // between the toolbar above and the results below.
    expect(stops.filter((button) => button.tabIndex === 0)).toHaveLength(1);

    fireEvent.keyDown(toolbar, { key: "ArrowRight" });
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Remove filter Cats" }),
    );

    fireEvent.keyDown(toolbar, { key: "Delete" });
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it("walks from where focus actually is, not from where the last render left it", () => {
    // An auto-repeating arrow key delivers two presses inside one task: focus
    // has already moved and the state behind it has not. Reading the state
    // walked every repeat after the first from the same stale stop.
    renderChips([
      chip({ key: "a", label: "Dogs" }),
      chip({ key: "b", facet: "age", label: "Cats" }),
      chip({ key: "c", facet: "size", label: "Small" }),
    ]);

    const toolbar = screen.getByRole("toolbar");
    screen.getByRole("button", { name: "Remove filter Dogs" }).focus();

    fireEvent.keyDown(toolbar, { key: "End" });
    fireEvent.keyDown(toolbar, { key: "ArrowRight" });
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Remove filter Dogs" }),
    );
  });

  it("hands focus to the next pill along when a key takes one off", () => {
    const onRemove = vi.fn();
    const { rerender } = renderChips([
      chip({ key: "a", label: "Dogs", onRemove }),
      chip({ key: "b", facet: "age", label: "Cats" }),
    ]);

    const toolbar = screen.getByRole("toolbar");
    screen.getByRole("button", { name: "Remove filter Dogs" }).focus();
    fireEvent.keyDown(toolbar, { key: "Delete" });

    rerender(
      <I18nProvider locale="en">
        <FilterChips
          chips={[chip({ key: "b", facet: "age", label: "Cats" })]}
          onClearAll={vi.fn()}
        />
      </I18nProvider>,
    );

    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Remove filter Cats" }),
    );
  });

  it("says what a pill is costing, and only when the answer is worth showing", () => {
    renderChips([
      chip({ key: "a", label: "Dogs", gain: 12 }),
      chip({ key: "b", facet: "age", label: "Cats", gain: 0 }),
    ]);

    // A tooltip trigger is the sign the answer exists; radix only renders the
    // content itself once the pointer has waited on it.
    const withGain = screen.getByRole("button", { name: "Remove filter Dogs" });
    const withoutGain = screen.getByRole("button", { name: "Remove filter Cats" });
    expect(withGain.hasAttribute("data-slot")).toBe(true);
    expect(withoutGain.hasAttribute("data-slot")).toBe(false);
  });

  it("marks the cheapest way out when nothing matches at all", () => {
    renderChips(
      [
        chip({ key: "a", label: "Dogs", gain: 2 }),
        chip({ key: "b", facet: "age", label: "Cats", gain: 9 }),
      ],
      { stuck: true },
    );

    const blocker = screen.getByRole("button", { name: "Remove filter Cats" });
    expect(blocker.textContent).toContain("+9");
    expect(blocker.className).toContain("filter-accent");
    // Only the one. Five numbers over five labels is not a way out.
    expect(
      screen.getByRole("button", { name: "Remove filter Dogs" }).textContent,
    ).not.toContain("+2");
  });

  it("offers the cleared state back, and nothing else, while the offer stands", () => {
    const onUndo = vi.fn();
    renderChips([], { undo: onUndo });

    expect(screen.getByText("Filters cleared")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Undo clearing the filters" }));
    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  it("still removes on click when a tooltip is wrapped around the pill", () => {
    // The pill with a cost becomes a Radix trigger via asChild, which merges
    // its own handlers into the button. A merge that lost the click would
    // have made exactly the pills worth pressing the ones that do nothing.
    const onRemove = vi.fn();
    renderChips([chip({ key: "a", label: "Dogs", gain: 12, onRemove })]);

    fireEvent.click(screen.getByRole("button", { name: "Remove filter Dogs" }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it("unfolds the blocking facet rather than marking a summary of three", () => {
    // A folded pill stands for several answers, so an accent on it points at
    // three shelters and says "drop this", and it would need two unrelated
    // numbers at once: the values it hides and the animals it costs.
    const shelters = ["Mala hiša", "Meli", "Muri"].map((label, index) =>
      chip({
        key: `shelter:${index}`,
        facet: "shelter",
        value: `s${index}`,
        label,
        gain: index === 1 ? 7 : 1,
      }),
    );
    renderChips(shelters, { stuck: true });

    expect(
      screen.queryByRole("button", { name: /Show all selected/ }),
    ).toBeNull();
    const blocker = screen.getByRole("button", { name: "Remove filter Meli" });
    expect(blocker.textContent).toContain("+7");
  });

  it("keeps the way out on screen when the row is over its cap", () => {
    const many = FILTER_FACETS.flatMap((facet) =>
      [0, 1].map((n) =>
        chip({
          key: `${facet}:${n}`,
          facet,
          value: `${n}`,
          label: `${facet}${n}`,
          // The very last pill is the one worth dropping, and it sits well
          // past the eighth.
          gain: facet === "care" && n === 1 ? 9 : 0,
        }),
      ),
    );
    renderChips(many, { stuck: true });

    expect(screen.queryByRole("button", { name: /Show \d+ more/ })).toBeNull();
    expect(
      screen.getByRole("button", { name: "Remove filter care1" }).textContent,
    ).toContain("+9");
  });

  it("hands focus onward when the key that removes takes the row with it", () => {
    const onRemove = vi.fn();
    renderChips([chip({ key: "only", label: "Dogs", onRemove })]);

    // Appended after the render container, so it is what follows the row in
    // document order the way the results grid does on the page.
    const after = document.createElement("button");
    after.textContent = "after the row";
    document.body.append(after);

    try {
      const toolbar = screen.getByRole("toolbar");
      screen.getByRole("button", { name: "Remove filter Dogs" }).focus();
      fireEvent.keyDown(toolbar, { key: "Delete" });

      // Focus moves before the removal, while there is still a row to leave.
      expect(onRemove).toHaveBeenCalledTimes(1);
      expect(document.activeElement).toBe(after);
    } finally {
      after.remove();
    }
  });

  it("scrolls the clear away with the pills rather than reserving a column for it", () => {
    // Parked outside the scroller it held 81 of a 390px phone row's 358
    // pixels for a control that clears everything, leaving 242px for the
    // pills. It is one tap away in the sheet footer the whole time.
    renderChips([chip({ key: "a", label: "Dogs" })]);

    const clear = screen.getByRole("button", { name: "Clear all filters" });
    expect(clear.closest(".fade-scroll-x")).not.toBeNull();
    // Still the last stop the arrow keys reach, wherever it is drawn.
    const stops = [...pills()].map((b) => b.getAttribute("data-chip-stop"));
    expect(stops[stops.length - 1]).toBe("clear");
  });

  it("brings the way out into view rather than leaving it past the scroll", () => {
    const scrollIntoView = vi.fn();
    const original = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = scrollIntoView;

    try {
      renderChips(
        [
          chip({ key: "a", label: "Dogs", gain: 1 }),
          chip({ key: "b", facet: "age", label: "Cats", gain: 8 }),
        ],
        { stuck: true },
      );
      expect(scrollIntoView).toHaveBeenCalled();
    } finally {
      HTMLElement.prototype.scrollIntoView = original;
    }
  });

  it("forgets which facets were unfolded once the filters are cleared", () => {
    const shelters = ["Mala hiša", "Meli", "Muri"].map((label, index) =>
      chip({ key: `shelter:${index}`, facet: "shelter", value: `s${index}`, label }),
    );
    const { rerender } = renderChips(shelters);

    fireEvent.click(
      screen.getByRole("button", { name: "Show all selected: Shelter" }),
    );
    expect(screen.getByRole("button", { name: "Remove filter Muri" })).toBeTruthy();

    // Clear, then arrive at a fresh three: they fold again rather than
    // inheriting a request that belonged to a state that no longer exists.
    fireEvent.click(screen.getByRole("button", { name: "Clear all filters" }));
    rerender(
      <I18nProvider locale="en">
        <FilterChips chips={shelters} onClearAll={vi.fn()} />
      </I18nProvider>,
    );
    expect(
      screen.getByRole("button", { name: "Show all selected: Shelter" }),
    ).toBeTruthy();
  });

  it("draws nothing at all with no chips and no offer", () => {
    const { container } = renderChips([]);
    expect(container.querySelector("[role='toolbar']")).toBeNull();
  });
});
