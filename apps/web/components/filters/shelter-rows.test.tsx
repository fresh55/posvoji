// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import {
  cleanup,
  render,
  fireEvent,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/components/i18n-provider";
import type { ShelterSummary } from "@/lib/shelter-summary";
import { ShelterRows } from "./shelter-rows";

const rows = [
  { value: "macja-hisa", label: "Zavetišče Mačja hiša", city: "Celje" },
  { value: "sia-in-lu", label: "Zavetišče Sia in Lu", city: "Celje" },
];

const counts = new Map([
  ["macja-hisa", 5],
  ["sia-in-lu", 2],
]);

// The info control is offered only for a shelter there is something to say
// about, the same hasDetails test the panel's own fill is drawn behind, so
// every render that expects the control has to hand in summaries for the rows
// it expects it on. A caller with no dataset behind it gets rows and nothing
// else, which is what the "nothing to open" cases below assert.
const detailSummaries: Map<string, ShelterSummary> = new Map([
  ["macja-hisa", { species: [{ species: "cat", count: 5 }] }],
  ["sia-in-lu", { species: [{ species: "dog", count: 2 }] }],
]);

// A toggle row is a wrapper marked data-shelter-row, holding the toggle
// button and, when the caller passes onInfo, the info control beside it.
// Splitting the markup on that attribute is what keeps this helper working
// whatever a row ends up holding; splitting on "<button" broke the moment a
// row held two of them. The chunk for a row runs to the start of the next
// row, so an assertion about one row never reads another's markup.
const rowTag = (html: string, label: string) =>
  html.split("data-shelter-row=").find((chunk) => chunk.includes(label)) ?? "";

describe("ShelterRows hover linking", () => {
  it("tints the row(s) named by the highlighted prop, not the others", () => {
    const html = renderToStaticMarkup(
      <ShelterRows
        rows={rows}
        counts={counts}
        selected={[]}
        onToggle={() => undefined}
        highlighted={["sia-in-lu"]}
      />,
    );

    // data-highlighted stays on the toggle button inside the row, which is
    // what the map and the keyboard code already reach for.
    expect(rowTag(html, "Sia in Lu")).toContain('data-highlighted="true"');
    expect(rowTag(html, "Mačja hiša")).not.toContain("data-highlighted");
  });

  it("leaves every row untinted when nothing is highlighted", () => {
    const html = renderToStaticMarkup(
      <ShelterRows
        rows={rows}
        counts={counts}
        selected={[]}
        onToggle={() => undefined}
      />,
    );

    expect(html).not.toContain("data-highlighted");
  });
});

describe("ShelterRows selection and counts", () => {
  it("marks a selected row inside the row, never on its surface", () => {
    const html = renderToStaticMarkup(
      <ShelterRows
        rows={rows}
        counts={counts}
        selected={["sia-in-lu"]}
        onToggle={() => undefined}
      />,
    );

    const selected = rowTag(html, "Sia in Lu");
    const unselected = rowTag(html, "Mačja hiša");

    // The check turns visible and green, the label gains weight and the
    // count pill takes the accent tint. Any shared fill on the row surface,
    // however faint, made two adjacent picked rows read as one shape across
    // the 2px gap between them, so the surface carries no selection at all.
    expect(selected).toContain("text-[var(--filter-accent-strong)]");
    expect(selected).toContain("font-medium");
    expect(selected).toContain("bg-[var(--filter-accent)]");
    expect(selected).not.toContain("bg-[var(--filter-accent)]/");
    expect(unselected).not.toContain("var(--filter-accent)");
  });

  it("keeps the hover and marker highlight the same on a selected row", () => {
    const highlighted = renderToStaticMarkup(
      <ShelterRows
        rows={rows}
        counts={counts}
        selected={["sia-in-lu"]}
        onToggle={() => undefined}
        highlighted={["sia-in-lu"]}
      />,
    );
    const resting = renderToStaticMarkup(
      <ShelterRows
        rows={rows}
        counts={counts}
        selected={["sia-in-lu"]}
        onToggle={() => undefined}
      />,
    );

    // The surface is free for feedback because it carries no selection: a
    // selected row answers hover and the map's echo like any other row.
    expect(rowTag(resting, "Sia in Lu")).toContain("hover:bg-muted/50");
    expect(rowTag(highlighted, "Sia in Lu")).toContain("bg-muted/50");
  });

  it("marks every row as clickable at rest", () => {
    const html = renderToStaticMarkup(
      <ShelterRows
        rows={rows}
        counts={counts}
        selected={[]}
        onToggle={() => undefined}
      />,
    );

    expect(rowTag(html, "Mačja hiša")).toContain("cursor-pointer");
  });

  it("dims a row with nothing to pick and offers it neither hand nor hover", () => {
    const html = renderToStaticMarkup(
      <ShelterRows
        rows={rows}
        counts={new Map([["macja-hisa", 5]])}
        selected={[]}
        onToggle={() => undefined}
      />,
    );

    // Sia in Lu has no animals and is not picked, so there is nothing its row
    // could toggle. It used to get all three of these from the <button> that
    // was the whole row; the surface is a div now, so the row says them.
    const dead = rowTag(html, "Sia in Lu");
    expect(dead).toContain("opacity-40");
    expect(dead).toContain("cursor-not-allowed");
    expect(dead).not.toContain("hover:bg-muted/50");
    expect(dead).toContain("disabled=");
  });

  it("keeps the count next to the shelter name as a quiet badge, not a far-right number", () => {
    const html = renderToStaticMarkup(
      <ShelterRows
        rows={rows}
        counts={counts}
        selected={[]}
        onToggle={() => undefined}
      />,
    );

    const row = rowTag(html, "Mačja hiša");
    // The count now lives inside the same inline group as the label, wearing
    // the same quiet rounded-full badge shape the sidebar uses elsewhere for
    // a count, rather than sitting in its own cell across the row.
    const labelIndex = row.indexOf("Mačja hiša");
    const countIndex = row.indexOf(">5<");
    expect(countIndex).toBeGreaterThan(-1);
    expect(countIndex).toBeGreaterThan(labelIndex);
    expect(row).toContain("rounded-full");
    expect(row).toContain("tabular-nums");
  });
});

// Every row and every marker reports aria-pressed, so activating one has to
// flip it: a click on a picked row drops that shelter and can never also
// re-open the details about it. The info control is the second act the row
// makes room for, wrapped in a Collapsible that opens ShelterDetails beneath
// the row; it exists on every toggle row a caller hands onToggleExpanded to,
// picked or not, because looking a shelter over before committing to it is
// the ordinary use.
describe("ShelterRows info control", () => {
  afterEach(() => cleanup());

  const infoLabel = (label: string) => `Pokaži podrobnosti za ${label}`;
  const hideInfoLabel = (label: string) => `Skrij podrobnosti za ${label}`;
  const infoText = "Pokaži podrobnosti";
  const hideInfoText = "Skrij podrobnosti";

  it("puts the control on every row, picked or not", () => {
    const html = renderToStaticMarkup(
      <ShelterRows
        rows={rows}
        counts={counts}
        selected={["sia-in-lu"]}
        onToggle={() => undefined}
        summaries={detailSummaries}
        onToggleExpanded={() => undefined}
        infoLabel={infoLabel}
      />,
    );

    // A chevron, not a circled i: the panel opens where the row sits, and the
    // chevron is the glyph that says so without a caption above the list
    // explaining it.
    const picked = rowTag(html, "Sia in Lu");
    expect(picked).toContain("lucide-chevron-down");
    expect(picked).toContain(
      'aria-label="Pokaži podrobnosti za Zavetišče Sia in Lu"',
    );

    // Unlike the old card's rows, an unpicked row is not the one caller with
    // nothing to open: it gets the same control, not a spacer standing in
    // for it.
    const unpicked = rowTag(html, "Mačja hiša");
    expect(unpicked).toContain("lucide-chevron-down");
    expect(unpicked).toContain(
      'aria-label="Pokaži podrobnosti za Zavetišče Mačja hiša"',
    );
  });

  it("offers no control for a shelter it has nothing to say about", () => {
    // hasDetails is the same test the panel's own fill is drawn behind, so a
    // control offered past it turns its chevron and reveals a blank strip,
    // which reads as broken rather than as "we know nothing here". Mačja hiša
    // has a summary, Sia in Lu has none; only the first gets the chevron.
    const html = renderToStaticMarkup(
      <ShelterRows
        rows={rows}
        counts={counts}
        selected={[]}
        onToggle={() => undefined}
        summaries={
          new Map([
            ["macja-hisa", { species: [{ species: "cat", count: 5 }] }],
          ]) as Map<string, ShelterSummary>
        }
        onToggleExpanded={() => undefined}
        infoLabel={infoLabel}
      />,
    );

    expect(rowTag(html, "Mačja hiša")).toContain(
      "Pokaži podrobnosti za Zavetišče Mačja hiša",
    );
    expect(rowTag(html, "Sia in Lu")).not.toContain("Pokaži podrobnosti");
    // And no Collapsible wrapped around a row with nothing under it.
    expect(rowTag(html, "Sia in Lu")).not.toContain('data-slot="collapsible"');
  });

  it("names what the count pill counts, for a reader who cannot see it", () => {
    // Two numbers ride every row, "23" in the pill and "23 km" in the
    // sublabel, and only one of them said what it was counting: the pill sits
    // inside the toggle, so its digits land in that button's accessible name.
    const html = renderToStaticMarkup(
      <ShelterRows
        rows={rows}
        counts={counts}
        selected={[]}
        onToggle={() => undefined}
        countLabel={(count) => `${count} živali`}
      />,
    );

    const row = rowTag(html, "Mačja hiša");
    expect(row).toContain('aria-hidden="true"');
    expect(row).toContain("5 živali");
  });

  it("builds no collapsible at all for a caller with nothing to open", () => {
    const html = renderToStaticMarkup(
      <ShelterRows
        rows={rows}
        counts={counts}
        selected={["sia-in-lu"]}
        onToggle={() => undefined}
      />,
    );

    // Omitting onToggleExpanded is what a caller with nothing to open does
    // (the off-site link list, a caller with no dataset behind it): the row
    // is returned exactly as it was before the control existed, with no
    // Collapsible built around it at all.
    expect(html).not.toContain("lucide-info");
    expect(html).not.toContain('data-slot="collapsible"');
  });

  it("asks about a shelter without un-picking it", () => {
    const onToggle = vi.fn();
    const onToggleExpanded = vi.fn();
    render(
      <ShelterRows
        rows={rows}
        counts={counts}
        selected={["sia-in-lu"]}
        onToggle={onToggle}
        summaries={detailSummaries}
        onToggleExpanded={onToggleExpanded}
        infoLabel={infoLabel}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Pokaži podrobnosti za Zavetišče Sia in Lu",
      }),
    );

    expect(onToggleExpanded).toHaveBeenCalledWith("sia-in-lu");
    // It sits beside the toggle rather than inside it, so the selection is
    // untouched: that is the whole point of the second control.
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("collapses the same way it opens, without un-picking it", () => {
    const onToggle = vi.fn();
    const onToggleExpanded = vi.fn();
    // Inside the provider, because an open row mounts ShelterDetails, which
    // reads the locale itself. That is the contract at the top of
    // shelter-rows.tsx: summaries plus onToggleExpanded is a caller asking for
    // a panel, and a panel is the one part of this list that is not renderable
    // outside I18nProvider.
    render(
      <I18nProvider locale="sl">
        <ShelterRows
          rows={rows}
          counts={counts}
          selected={["sia-in-lu"]}
          onToggle={onToggle}
          expanded="sia-in-lu"
          summaries={detailSummaries}
          onToggleExpanded={onToggleExpanded}
          infoLabel={infoLabel}
          hideInfoLabel={hideInfoLabel}
          hideInfoText={hideInfoText}
        />
      </I18nProvider>,
    );

    // Collapsing is the control's own second click, not a different control:
    // onToggleExpanded is still the one thing it calls, with the same value.
    fireEvent.click(
      screen.getByRole("button", {
        name: "Skrij podrobnosti za Zavetišče Sia in Lu",
      }),
    );

    expect(onToggleExpanded).toHaveBeenCalledWith("sia-in-lu");
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("flips the control's accessible name, aria-expanded and chevron with the row it opens", () => {
    render(
      <I18nProvider locale="sl">
        <ShelterRows
          rows={rows}
          counts={counts}
          selected={["sia-in-lu"]}
          onToggle={() => undefined}
          expanded="sia-in-lu"
          summaries={detailSummaries}
          onToggleExpanded={() => undefined}
          infoLabel={infoLabel}
          hideInfoLabel={hideInfoLabel}
          infoText={infoText}
          hideInfoText={hideInfoText}
        />
      </I18nProvider>,
    );

    // The chevron rotates and the box does not move. The words that go with
    // each state live in the tooltip and in the accessible name, never on the
    // button's own surface: a control wide enough to carry them took the width
    // out of the shelter's name, and the open row is the one row whose name
    // matters most. Never an X either way.
    const open = screen.getByRole("button", {
      name: "Skrij podrobnosti za Zavetišče Sia in Lu",
    });
    expect(open.getAttribute("aria-expanded")).toBe("true");
    expect(open.textContent).toBe("");
    expect(open.querySelector(".lucide-chevron-up")).not.toBeNull();

    const closed = screen.getByRole("button", {
      name: "Pokaži podrobnosti za Zavetišče Mačja hiša",
    });
    expect(closed.getAttribute("aria-expanded")).toBe("false");
    expect(closed.textContent).toBe("");
    expect(closed.querySelector(".lucide-chevron-down")).not.toBeNull();
  });

  it("still walks the toggle buttons with the arrow keys once each row carries a second control", () => {
    render(
      <ShelterRows
        rows={rows}
        counts={counts}
        selected={[]}
        onToggle={() => undefined}
        summaries={detailSummaries}
        onToggleExpanded={() => undefined}
        infoLabel={infoLabel}
      />,
    );

    // aria-pressed is what tells a row's own toggle apart from the info
    // control beside it, the same filter moveFocus itself applies.
    const toggles = screen
      .getAllByRole("button")
      .filter((button) => button.getAttribute("aria-pressed") !== null);
    const macja = toggles.find((button) =>
      button.textContent?.includes("Mačja hiša"),
    )!;
    const sia = toggles.find((button) =>
      button.textContent?.includes("Sia in Lu"),
    )!;
    macja.focus();

    fireEvent.keyDown(macja, { key: "ArrowDown" });
    // Lands on the next shelter's own toggle, never on the info control
    // sitting beside either one: the walk stays one stop per shelter.
    expect(document.activeElement).toBe(sia);
  });
});

// ShelterDetails reads the locale itself, so any test that exercises the
// panel's actual content, rather than just the control that opens it, has to
// render inside I18nProvider (the picker already does).
describe("ShelterRows expansion", () => {
  afterEach(() => cleanup());

  const infoLabel = (label: string) => `Pokaži podrobnosti za ${label}`;
  const hideInfoLabel = (label: string) => `Skrij podrobnosti za ${label}`;
  const hideInfoText = "Skrij podrobnosti";
  const summaries: Map<string, ShelterSummary> = new Map([
    ["macja-hisa", { species: [{ species: "cat", count: 4 }] }],
    ["sia-in-lu", { species: [{ species: "dog", count: 2 }] }],
  ]);

  function renderExpanded(expanded: string | null) {
    return render(
      <I18nProvider locale="sl">
        <ShelterRows
          rows={rows}
          counts={counts}
          selected={[]}
          onToggle={() => undefined}
          onToggleExpanded={() => undefined}
          infoLabel={infoLabel}
          hideInfoLabel={hideInfoLabel}
          hideInfoText={hideInfoText}
          summaries={summaries}
          expanded={expanded}
        />
      </I18nProvider>,
    );
  }

  it("opens only the shelter `expanded` names, and moves the panel when the prop moves", () => {
    const { container, rerender } = renderExpanded("sia-in-lu");

    // One panel open, and it is the dog shelter's, not the cat shelter's.
    expect(container.querySelectorAll("[data-shelter-details]")).toHaveLength(
      1,
    );
    expect(screen.getByLabelText("Pes: 2")).toBeTruthy();
    expect(screen.queryByLabelText("Mačka: 4")).toBeNull();

    rerender(
      <I18nProvider locale="sl">
        <ShelterRows
          rows={rows}
          counts={counts}
          selected={[]}
          onToggle={() => undefined}
          onToggleExpanded={() => undefined}
          infoLabel={infoLabel}
          hideInfoLabel={hideInfoLabel}
          hideInfoText={hideInfoText}
          summaries={summaries}
          expanded="macja-hisa"
        />
      </I18nProvider>,
    );

    // One-at-a-time held across the move: still exactly one panel, now the
    // other shelter's.
    expect(container.querySelectorAll("[data-shelter-details]")).toHaveLength(
      1,
    );
    expect(screen.getByLabelText("Mačka: 4")).toBeTruthy();
    expect(screen.queryByLabelText("Pes: 2")).toBeNull();
  });

  it("closes every panel when `expanded` names no shelter", () => {
    const { container } = renderExpanded(null);

    expect(container.querySelectorAll("[data-shelter-details]")).toHaveLength(
      0,
    );
  });
});

describe("ShelterRows map-hover scroll echo", () => {
  // jsdom lays nothing out and has no scrollIntoView, same gap
  // filter-sections.test.tsx works around for the same reason.
  const scrollIntoView = vi.fn();

  beforeEach(() => {
    Element.prototype.scrollIntoView = scrollIntoView;
    scrollIntoView.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it("scrolls the row matching a map-driven highlight into view", async () => {
    const { rerender } = render(
      <ShelterRows
        rows={rows}
        counts={counts}
        selected={[]}
        onToggle={() => undefined}
      />,
    );

    rerender(
      <ShelterRows
        rows={rows}
        counts={counts}
        selected={[]}
        onToggle={() => undefined}
        highlighted={["sia-in-lu"]}
        scrollTo="sia-in-lu"
      />,
    );

    await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(1));
    expect(scrollIntoView.mock.calls[0]?.[0]).toMatchObject({
      block: "nearest",
      behavior: "auto",
    });
  });

  it("never scrolls while the pointer sits inside the list, so an in-progress scroll cannot be yanked", async () => {
    const { container, rerender } = render(
      <ShelterRows
        rows={rows}
        counts={counts}
        selected={[]}
        onToggle={() => undefined}
      />,
    );

    // The list itself, not a row: this is the container a row's own
    // onPointerEnter/Leave never touches, so it is the one true "pointer is
    // browsing the list by hand" signal.
    const list = container.firstElementChild as Element;
    fireEvent.pointerEnter(list);

    rerender(
      <ShelterRows
        rows={rows}
        counts={counts}
        selected={[]}
        onToggle={() => undefined}
        highlighted={["sia-in-lu"]}
        scrollTo="sia-in-lu"
      />,
    );

    // Give the effect a turn to run before asserting its absence.
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    expect(scrollIntoView).not.toHaveBeenCalled();

    fireEvent.pointerLeave(list);
    rerender(
      <ShelterRows
        rows={rows}
        counts={counts}
        selected={[]}
        onToggle={() => undefined}
        highlighted={["macja-hisa"]}
        scrollTo="macja-hisa"
      />,
    );
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(1));
  });

  it("does not scroll for a row's own pointer hover, only for a map-driven one", () => {
    const onHoverRow = vi.fn();
    const { getByText } = render(
      <ShelterRows
        rows={rows}
        counts={counts}
        selected={[]}
        onToggle={() => undefined}
        onHoverRow={onHoverRow}
      />,
    );

    // A row's own hover feeds onHoverRow, a different prop entirely (see
    // location-picker.tsx: it becomes hoveredRowValue, which drives the
    // map's highlight, not this list's). It never sets `scrollTo`, so it can
    // never trigger the scroll on its own.
    const row = getByText("Zavetišče Mačja hiša").closest("button")!;
    fireEvent.pointerEnter(row);

    expect(onHoverRow).toHaveBeenCalledWith("macja-hisa");
    expect(scrollIntoView).not.toHaveBeenCalled();
  });
});

// The off-site rows in location-picker.tsx: a registry shelter with nothing
// to filter by links to its own page instead of toggling a selection.
const linkRows = [
  {
    value: "vzhod",
    label: "Zavetišče Vzhod",
    city: "Celje",
    href: "/zavetisca/vzhod",
  },
];

describe("ShelterRows link rows", () => {
  afterEach(() => cleanup());

  it("renders a row carrying an href as a link, not a toggle button", () => {
    const html = renderToStaticMarkup(<ShelterRows rows={linkRows} />);

    expect(html).toContain('href="/zavetisca/vzhod"');
    expect(html).not.toContain("<button");
  });

  it("keeps a toggle row's columns: the check's spacer, no count badge", () => {
    const html = renderToStaticMarkup(<ShelterRows rows={linkRows} />);

    // The size-3.5 spacer stands in for the check icon, so the label lines
    // up with a toggle row's own; a link is never checked, so nothing sits
    // in it.
    expect(html).toContain(
      '<span class="size-3.5 shrink-0" aria-hidden="true">',
    );
    expect(html).not.toContain("rounded-full");
    expect(html).not.toContain("tabular-nums");
    // The label reads muted, the way an unchecked toggle row's does, and the
    // trailing chevron says the row leads somewhere.
    expect(html).toContain("text-muted-foreground");
    expect(html).toContain("lucide-chevron-right");
  });

  it("shows the same city-and-distance sublabel a toggle row shows", () => {
    const html = renderToStaticMarkup(
      <ShelterRows
        rows={[{ ...linkRows[0], km: 4.2 }]}
        lessThanOneKm="manj kot 1 km"
      />,
    );

    expect(html).toContain("Celje · 4 km");
  });

  it("lights up from the map with the same data attribute a toggle row wears", () => {
    const html = renderToStaticMarkup(
      <ShelterRows rows={linkRows} highlighted={["vzhod"]} />,
    );

    expect(html).toContain('data-highlighted="true"');
    expect(html).toContain("bg-muted/50");
  });

  it("feeds its own pointer hover to onHoverRow, the same as a toggle row", () => {
    const onHoverRow = vi.fn();
    render(<ShelterRows rows={linkRows} onHoverRow={onHoverRow} />);

    const link = screen.getByRole("link");
    fireEvent.pointerEnter(link);
    expect(onHoverRow).toHaveBeenCalledWith("vzhod");

    fireEvent.pointerLeave(link);
    expect(onHoverRow).toHaveBeenCalledWith(null);
  });

  it("renders without onToggle, counts or selected: none of them apply to a link", () => {
    // The three toggle-only props are all optional. A caller rendering a
    // link-only list is not made to fabricate a Map and an array it will
    // never read.
    expect(() => render(<ShelterRows rows={linkRows} />)).not.toThrow();
  });

  it("never gives a link row an info control, even when the caller hands in onToggleExpanded", () => {
    const html = renderToStaticMarkup(
      <ShelterRows
        rows={linkRows}
        onToggleExpanded={() => undefined}
        infoLabel={(label) => `Pokaži podrobnosti za ${label}`}
        summaries={
          new Map([["vzhod", { species: [{ species: "dog", count: 1 }] }]])
        }
      />,
    );

    // The href branch returns before onToggleExpanded is ever consulted: a
    // link row navigates instead of expanding, so it never grows the control
    // and never gets wrapped in a Collapsible.
    expect(html).not.toContain("lucide-info");
    expect(html).not.toContain('data-slot="collapsible"');
  });

  it("leaves a link row out of the arrow-key walk between toggle rows", () => {
    const toggleRows = [
      { value: "jug", label: "Zavetišče Jug", city: "Ljubljana" },
      { value: "sever", label: "Zavetišče Sever", city: "Maribor" },
    ];
    const toggleCounts = new Map([
      ["jug", 3],
      ["sever", 1],
    ]);
    render(
      <ShelterRows
        rows={[...toggleRows, ...linkRows]}
        counts={toggleCounts}
        selected={[]}
        onToggle={() => undefined}
      />,
    );

    const jug = screen.getByRole("button", { name: /Jug/ });
    const sever = screen.getByRole("button", { name: /Sever/ });
    jug.focus();

    fireEvent.keyDown(jug, { key: "ArrowDown" });
    // Walks to the other enabled toggle row, never to the link that follows
    // it in the list.
    expect(document.activeElement).toBe(sever);

    fireEvent.keyDown(sever, { key: "ArrowDown" });
    // End was already the last toggle row: the walk clamps there instead of
    // spilling into the link row.
    expect(document.activeElement).toBe(sever);
  });
});

// The live list and the off-site list are two separate ShelterRows mounted
// side by side in location-picker.tsx, both watching the one hoveredMarkerValues
// array a map hover produces. A town can hold a live shelter and an off-site
// one at once, so the same highlighted array can name a value from each list
// in the same hover. Both instances mount the identical scroll-into-view
// effect against that one array, so both run; what keeps them from fighting
// over the shared scroll container is that each instance's own refs map only
// ever holds the rows it was given, so a lookup for a value that belongs to
// the other list quietly finds nothing and does nothing.
describe("ShelterRows two lists sharing one highlight", () => {
  afterEach(() => cleanup());

  it("scrolls only the list that actually holds the first highlighted value", async () => {
    const macjaHisa = [
      { value: "macja-hisa", label: "Zavetišče Mačja hiša", city: "Celje" },
    ];
    const siaInLu = [
      {
        value: "sia-in-lu",
        label: "Zavetišče Sia in Lu",
        city: "Celje",
        href: "/zavetisca/sia-in-lu",
      },
    ];
    const celjeCounts = new Map([["macja-hisa", 5]]);

    // Both lists take the one scrollTo the picker computes, which is what
    // makes the ref lookup the arbiter between them.
    function Lists({
      highlighted,
      scrollTo,
    }: {
      highlighted: string[];
      scrollTo?: string;
    }) {
      return (
        <>
          <ShelterRows
            rows={macjaHisa}
            counts={celjeCounts}
            selected={[]}
            onToggle={() => undefined}
            highlighted={highlighted}
            scrollTo={scrollTo}
          />
          <ShelterRows
            rows={siaInLu}
            highlighted={highlighted}
            scrollTo={scrollTo}
          />
        </>
      );
    }

    const { rerender } = render(<Lists highlighted={[]} />);

    const link = screen.getByRole("link");
    const toggle = screen.getByRole("button", { name: /Mačja hiša/ });
    const linkScroll = vi.fn();
    const toggleScroll = vi.fn();
    Object.defineProperty(link, "scrollIntoView", {
      value: linkScroll,
      configurable: true,
    });
    Object.defineProperty(toggle, "scrollIntoView", {
      value: toggleScroll,
      configurable: true,
    });

    // The off-site shelter named first in the shared array, as it would be
    // if the marker that shares their town put it first.
    rerender(
      <Lists highlighted={["sia-in-lu", "macja-hisa"]} scrollTo="sia-in-lu" />,
    );

    await waitFor(() => expect(linkScroll).toHaveBeenCalledTimes(1));
    expect(toggleScroll).not.toHaveBeenCalled();
  });
});
