// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/components/i18n-provider";
import { FILTER_FACETS } from "@/lib/filters";
import { fakeStripLayout } from "@/test/strip-layout";
import { chipPill as pillOf } from "@/test/filter-rows";
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

/** The row's own stops. The attribute and not tabIndex: the row roves, so
 *  every stop but the active one carries -1 as well. */
function pills() {
  return [
    ...screen
      .getByRole("toolbar")
      .querySelectorAll<HTMLButtonElement>("button[data-chip-stop]"),
  ];
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
      glyphOf(pillOf(label)),
    );
    expect(new Set(marks).size).toBe(4);
  });

  it("says size with the same paw at three sizes the cards use", () => {
    renderChips([
      chip({ key: "size:small", facet: "size", value: "small", label: "Majhna" }),
      chip({ key: "size:large", facet: "size", value: "large", label: "Velika" }),
    ]);

    const small = glyphOf(pillOf("Majhna"));
    const large = glyphOf(pillOf("Velika"));
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
      "text-brand-strong",
    );
    expect(glyphOf(shelter)).not.toBe(glyphOf(pillOf("Odrasel")));
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
      "Clear filters",
    ]);
  });

  it("stacks the colours a folded run of colours stands for", () => {
    // The facet's palette mark said some colour was on and nothing about
    // which, so the pill had to be opened to find out.
    renderChips(
      ["black", "white", "multicolour"].map((value) =>
        chip({ key: `coatColor:${value}`, facet: "coatColor", value, label: value }),
      ),
    );

    const folded = screen.getByRole("button", { name: /^Show all/ });
    expect(folded.querySelectorAll("svg circle[fill='none']")).toHaveLength(3);
    expect(folded.querySelector(".lucide-palette")).toBeNull();
  });

  it.each(["band", "flow"] as const)(
    "takes the filter off from a press anywhere on the pill in the %s",
    (placement) => {
      // Beside the panel the pill's name used to go to the section that set
      // the filter, and only the cross took it off. It reads as one control
      // with an x on it, and a press on the name that left the filter on read
      // as the row being broken.
      const onRemove = vi.fn();
      renderChips([chip({ key: "a", label: "Dogs", onRemove })], { placement });

      const pill = pillOf("Dogs");
      expect(pill.textContent).toContain("Dogs");
      fireEvent.click(pill);
      expect(onRemove).toHaveBeenCalledTimes(1);
    },
  );

  it("brings a single new pill into view, and stays put for a whole restored set", () => {
    // Never scrollIntoView: it moves Chrome's sequential focus navigation
    // starting point, and a single-facet deep link makes this row fire on
    // mount, which would hand the page's first Tab press to a remove button
    // (lib/scroll-strip.ts).
    // jsdom does not implement scrollIntoView at all, so it is installed here
    // rather than spied on: the point is that nothing reaches for it.
    const scrollIntoView = vi.fn();
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });
    // Four pills of 100px in a row 220px wide, so the fourth is off the end.
    const layout = fakeStripLayout({ itemSelector: "[data-chip-stop]" });

    try {
      // One value per facet: three of a kind would fold into a summary pill
      // and the row would have no stop for the new one to be measured against.
      const first = (["sex", "age", "size"] as const).map((facet, index) =>
        chip({ key: `${facet}:a`, facet, label: `Filter ${index}` }),
      );
      const late = chip({ key: "energy:d", facet: "energy", label: "Mlad" });
      const { container, rerender } = renderChips(first);
      const strip = container.querySelector(
        "[data-scroll-strip]",
      ) as HTMLElement;
      layout.writes.length = 0;

      const render2 = (chips: Chip[]) => (
        <I18nProvider locale="en">
          <FilterChips chips={chips} onClearAll={vi.fn()} />
        </I18nProvider>
      );

      // One pick, from a sheet that was covering this row: it has to be
      // visible when the sheet closes.
      rerender(render2([...first, late]));
      expect(layout.writes).toHaveLength(1);
      expect(layout.at(strip)).toBeGreaterThan(0);

      // Several at once is an undo or a fresh page. No single pill to point at.
      layout.writes.length = 0;
      rerender(render2([]));
      rerender(render2([...first, late]));
      expect(layout.writes).toHaveLength(0);

      expect(scrollIntoView).not.toHaveBeenCalled();
    } finally {
      layout.restore();
      Reflect.deleteProperty(Element.prototype, "scrollIntoView");
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
    // Every facet at two values each makes many pills inside a header that
    // is sticky on a phone, and two per facet is under the fold threshold,
    // so the count is the only thing bounding the row here.
    const many = FILTER_FACETS.flatMap((facet) =>
      [0, 1].map((n) => chip({ key: `${facet}:${n}`, facet, label: `${facet}${n}` })),
    );
    expect(many).toHaveLength(FILTER_FACETS.length * 2);
    renderChips(many);

    expect(screen.queryByRole("button", { name: "Remove filter care1" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: `Show ${many.length - 8} more` }));
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
    expect(document.activeElement).toBe(pillOf("Cats"));

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
    pillOf("Dogs").focus();

    fireEvent.keyDown(toolbar, { key: "End" });
    fireEvent.keyDown(toolbar, { key: "ArrowRight" });
    expect(document.activeElement).toBe(pillOf("Dogs"));
  });

  it("hands focus to the next pill along when a key takes one off", () => {
    const onRemove = vi.fn();
    const { rerender } = renderChips([
      chip({ key: "a", label: "Dogs", onRemove }),
      chip({ key: "b", facet: "age", label: "Cats" }),
    ]);

    const toolbar = screen.getByRole("toolbar");
    pillOf("Dogs").focus();
    fireEvent.keyDown(toolbar, { key: "Delete" });

    rerender(
      <I18nProvider locale="en">
        <FilterChips
          chips={[chip({ key: "b", facet: "age", label: "Cats" })]}
          onClearAll={vi.fn()}
        />
      </I18nProvider>,
    );

    expect(document.activeElement).toBe(pillOf("Cats"));
  });

  it("hands focus on when Enter or Space on the pill takes it off", () => {
    // Enter and Space dispatch a real click, so the pill used to take the
    // pointer path, which leaves focus alone on purpose: the row unmounted
    // underneath the keyboard and focus fell to the body, putting the next
    // Tab back at the top of the document. detail counts presses and is 0
    // when a key sent the click, which is what tells the two apart.
    const onRemove = vi.fn();
    const { rerender } = renderChips(
      [
        chip({ key: "a", label: "Dogs", onRemove }),
        chip({ key: "b", facet: "age", label: "Cats" }),
      ],
      { placement: "flow" },
    );

    const dogs = pillOf("Dogs");
    dogs.focus();
    fireEvent.click(dogs, { detail: 0 });
    expect(onRemove).toHaveBeenCalledTimes(1);

    rerender(
      <I18nProvider locale="en">
        <FilterChips
          chips={[chip({ key: "b", facet: "age", label: "Cats" })]}
          onClearAll={vi.fn()}
          placement="flow"
        />
      </I18nProvider>,
    );

    expect(document.activeElement).toBe(pillOf("Cats"));
  });

  it("hands focus past the row when a keypress takes the last pill off", () => {
    const onRemove = vi.fn();
    renderChips([chip({ key: "only", label: "Dogs", onRemove })]);

    const after = document.createElement("button");
    after.textContent = "after the row";
    document.body.append(after);

    try {
      const dogs = screen.getByRole("button", { name: "Remove filter Dogs" });
      dogs.focus();
      fireEvent.click(dogs, { detail: 0 });

      expect(onRemove).toHaveBeenCalledTimes(1);
      expect(document.activeElement).toBe(after);
    } finally {
      after.remove();
    }
  });

  it("hands focus past what cannot take it: an inert control or a hidden row", () => {
    // In document order the first focusable after the phone row is BackToTop,
    // inert until the page has scrolled, and after the band row at lg it is
    // the phone row itself, display:none. focus() on either is a no-op and
    // the visitor would land on the body, which is what the hand-off exists
    // to prevent.
    const onRemove = vi.fn();
    renderChips([chip({ key: "only", label: "Dogs", onRemove })]);

    const inert = document.createElement("button");
    inert.textContent = "back to top";
    inert.setAttribute("inert", "");
    const hidden = document.createElement("div");
    hidden.style.display = "none";
    const hiddenPill = document.createElement("button");
    hiddenPill.textContent = "a pill in the other row";
    hidden.append(hiddenPill);
    const card = document.createElement("a");
    card.href = "/zivali/x";
    card.textContent = "first card";
    document.body.append(inert, hidden, card);

    try {
      const dogs = screen.getByRole("button", { name: "Remove filter Dogs" });
      dogs.focus();
      fireEvent.click(dogs, { detail: 0 });

      expect(onRemove).toHaveBeenCalledTimes(1);
      expect(document.activeElement).toBe(card);
    } finally {
      inert.remove();
      hidden.remove();
      card.remove();
    }
  });

  it("falls back to the last stop when the removal takes the clear with it", () => {
    // The phone row draws its clear only while nothing matches. Removing the
    // pill that was blocking the results turns the clear off in the same
    // render, so the stop the keystroke aimed at is gone; the row must not
    // drop focus on the body for it.
    const onRemove = vi.fn();
    const { rerender } = render(
      <I18nProvider locale="en">
        <FilterChips
          chips={[
            chip({ key: "a", label: "Dogs" }),
            chip({ key: "b", facet: "age", label: "Puppies", onRemove }),
          ]}
          onClearAll={vi.fn()}
          placement="flow"
          stuck
        />
      </I18nProvider>,
    );

    const puppies = screen.getByRole("button", { name: "Remove filter Puppies" });
    puppies.focus();
    fireEvent.keyDown(puppies, { key: "Delete" });
    expect(onRemove).toHaveBeenCalledTimes(1);

    rerender(
      <I18nProvider locale="en">
        <FilterChips
          chips={[chip({ key: "a", label: "Dogs" })]}
          onClearAll={vi.fn()}
          placement="flow"
        />
      </I18nProvider>,
    );

    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Remove filter Dogs" }),
    );
  });

  it("leaves focus where a pointer left it", () => {
    // A mouse gets no focus move: the cursor is already where the visitor is
    // looking, and stealing focus to the neighbouring pill would put a ring
    // on a control nobody asked for.
    const onRemove = vi.fn();
    const { rerender } = renderChips([
      chip({ key: "a", label: "Dogs", onRemove }),
      chip({ key: "b", facet: "age", label: "Cats" }),
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Remove filter Dogs" }), {
      detail: 1,
    });
    expect(onRemove).toHaveBeenCalledTimes(1);

    rerender(
      <I18nProvider locale="en">
        <FilterChips
          chips={[chip({ key: "b", facet: "age", label: "Cats" })]}
          onClearAll={vi.fn()}
        />
      </I18nProvider>,
    );

    expect(document.activeElement).toBe(document.body);
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

    // The number is in the name as well as on the pill: "+9" and a paw are
    // drawn, and a label stopping at "Remove filter Cats" left a screen reader
    // with the mark and no reading of it.
    // The number is on the pill; the reading of it is on the control that
    // acts on it.
    expect(
      screen.getByRole("button", { name: "Remove filter Cats: +9 animals" }),
    ).toBeTruthy();
    expect(pillOf("Cats").textContent).toContain("+9");
    expect(pillOf("Cats").className).toContain("bg-brand");
    // Only the one. Five numbers over five labels is not a way out.
    expect(pillOf("Dogs").textContent).not.toContain("+2");
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
    const blocker = screen.getByRole("button", {
      name: "Remove filter Meli: +7 animals",
    });
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
      screen.getByRole("button", { name: "Remove filter care1: +9 animals" }),
    ).toBeTruthy();
    expect(pillOf("care1").textContent).toContain("+9");
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
      pillOf("Dogs").focus();
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

    const clear = screen.getByRole("button", { name: "Clear filters" });
    expect(clear.closest(".fade-scroll-x")).not.toBeNull();
    // Still the last stop the arrow keys reach, wherever it is drawn.
    const stops = [...pills()].map((b) => b.getAttribute("data-chip-stop"));
    expect(stops[stops.length - 1]).toBe("clear");
  });

  it("draws no clear in flow while something matches, stops and seam with it", () => {
    // In flow the sheet's footer holds a clear one tap away the whole time,
    // so the row spends a line on one only where clearing is the point of the
    // screen. Everything that belongs to the button goes when it does.
    const { container } = renderChips(
      [
        chip({ key: "a", label: "Dogs" }),
        chip({ key: "b", facet: "age", label: "Cats" }),
      ],
      { placement: "flow" },
    );

    expect(
      screen.queryByRole("button", { name: "Clear filters" }),
    ).toBeNull();

    // No stop bookkeeping for a button nobody draws: the last stop the arrows
    // can reach is the last pill.
    const stops = [...pills()].map((button) =>
      button.getAttribute("data-chip-stop"),
    );
    expect(stops).toEqual(["a", "b"]);

    // The seam guards the button against an overscroll flick. With no button
    // behind the pills there is nothing to guard, and a line at the end of
    // the row is then a line to nowhere.
    const row = container.querySelector("section[role='toolbar'] > div");
    expect(row?.querySelectorAll("span[aria-hidden]")).toHaveLength(0);
    expect(row?.querySelectorAll("button")).toHaveLength(2);
  });

  it("brings the way out into view rather than leaving it past the scroll", () => {
    // The marked pill is the third of four, past the 220px the row shows, and
    // this state arrives on a deep link, so it is another mount-time scroll
    // that may not touch scrollIntoView.
    const layout = fakeStripLayout({ itemSelector: "[data-chip-stop]" });

    try {
      const { container } = renderChips(
        [
          chip({ key: "a", label: "Dogs", gain: 1 }),
          chip({ key: "b", facet: "age", label: "Cats", gain: 2 }),
          chip({ key: "c", facet: "size", label: "Small", gain: 8 }),
        ],
        { stuck: true },
      );
      const strip = container.querySelector(
        "[data-scroll-strip]",
      ) as HTMLElement;

      expect(layout.writes.length).toBeGreaterThan(0);
      expect(layout.at(strip)).toBeGreaterThan(0);
    } finally {
      layout.restore();
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
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    rerender(
      <I18nProvider locale="en">
        <FilterChips chips={shelters} onClearAll={vi.fn()} />
      </I18nProvider>,
    );
    expect(
      screen.getByRole("button", { name: "Show all selected: Shelter" }),
    ).toBeTruthy();
  });

  it("wraps the pills instead of laying a second sideways scroller under the bar", () => {
    // What the phone's in-flow row asks for (animal-filters.tsx). A strip
    // there would be a horizontal scroller stacked under the species strip
    // inside a page that already scrolls vertically, which is the objection
    // that kept this row off a phone in the first place; the page's own
    // vertical scroll is what a wrapping row costs instead.
    renderChips(
      [
        chip({ key: "a", label: "Dogs" }),
        chip({ key: "b", facet: "age", label: "Cats" }),
      ],
      { placement: "flow" },
    );

    const dogs = screen.getByRole("button", { name: "Remove filter Dogs" });
    const box = dogs.closest("span")?.parentElement;

    // The box around the pills scrolls nothing: no overflow to scroll in, and
    // none of the fade the strip draws over its own edges. Read off the
    // classes, because jsdom lays nothing out. The mark goes with them: it
    // tells a child it can be scrolled into view inside this box.
    const outer = box?.parentElement;
    expect(outer?.className).not.toContain("overflow-x-auto");
    expect(outer?.className).not.toContain("fade-scroll-x");
    expect(outer?.hasAttribute("data-scroll-strip")).toBe(false);

    expect(box?.className).toContain("flex-wrap");
    // w-max is the strip's own width: a row as wide as its content, for the
    // strip to scroll. Wrapping, the row is as wide as the box it is in.
    expect(box?.className).not.toContain("w-max");

    // Two pixels tighter per side on a thumb: at 375 three typical pills
    // measured 110, 112 and 111 wide at px-3 and missed one line by 6px.
    expect(dogs.className).toContain("pointer-coarse:px-2.5");
    expect(dogs.className).not.toContain("pointer-coarse:px-3");
  });

  it("takes a lower cap than the bar's own, and hands the rest over on press", () => {
    // The phone's row caps at five (animal-filters.tsx). It wraps, so the cap
    // bounds how many lines the row can push the grid down by rather than how
    // far it runs off the right edge, and five is what fits two lines at 375.
    const six = FILTER_FACETS.slice(0, 6).map((facet) =>
      chip({ key: `${facet}:0`, facet, label: `${facet}0` }),
    );
    expect(six).toHaveLength(6);
    renderChips(six, { placement: "flow" });

    expect(
      screen.getAllByRole("button", { name: /^Remove filter/ }),
    ).toHaveLength(5);
    const more = screen.getByRole("button", { name: "Show 1 more" });
    expect(more.textContent).toBe("+1");

    fireEvent.click(more);
    expect(
      screen.getAllByRole("button", { name: /^Remove filter/ }),
    ).toHaveLength(6);
  });

  it("draws nothing at all with no chips and no offer", () => {
    const { container } = renderChips([]);
    expect(container.querySelector("[role='toolbar']")).toBeNull();
  });
});
