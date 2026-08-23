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
import { ShelterRows } from "./shelter-rows";

const rows = [
  { value: "macja-hisa", label: "Zavetišče Mačja hiša", city: "Celje" },
  { value: "sia-in-lu", label: "Zavetišče Sia in Lu", city: "Celje" },
];

const counts = new Map([
  ["macja-hisa", 5],
  ["sia-in-lu", 2],
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
// re-open the card about it. The info control is the second act the row makes
// room for, and it only exists where a caller has a card to open.
describe("ShelterRows info control", () => {
  afterEach(() => cleanup());

  const infoLabel = (label: string) => `Pokaži podrobnosti za ${label}`;

  it("puts the control on a picked row and reserves its slot on the others", () => {
    const html = renderToStaticMarkup(
      <ShelterRows
        rows={rows}
        counts={counts}
        selected={["sia-in-lu"]}
        onToggle={() => undefined}
        onInfo={() => undefined}
        infoLabel={infoLabel}
      />,
    );

    const picked = rowTag(html, "Sia in Lu");
    expect(picked).toContain("lucide-info");
    expect(picked).toContain(
      'aria-label="Pokaži podrobnosti za Zavetišče Sia in Lu"',
    );

    // The unpicked row holds an inert span of the same size, so picking a row
    // does not shove the count pills of the rows around it sideways.
    const unpicked = rowTag(html, "Mačja hiša");
    expect(unpicked).not.toContain("lucide-info");
    expect(unpicked).toContain(
      '<span aria-hidden="true" class="hidden size-6 shrink-0 lg:block">',
    );
  });

  it("reserves no slot at all for a caller with nothing to open", () => {
    const html = renderToStaticMarkup(
      <ShelterRows
        rows={rows}
        counts={counts}
        selected={["sia-in-lu"]}
        onToggle={() => undefined}
      />,
    );

    // The rows inside a group card (map-pick-card.tsx) render this way, and
    // they keep the layout they had before the control existed.
    expect(html).not.toContain("lucide-info");
    expect(html).not.toContain("size-6");
  });

  it("asks about a shelter without un-picking it", () => {
    const onToggle = vi.fn();
    const onInfo = vi.fn();
    render(
      <ShelterRows
        rows={rows}
        counts={counts}
        selected={["sia-in-lu"]}
        onToggle={onToggle}
        onInfo={onInfo}
        infoLabel={infoLabel}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Pokaži podrobnosti za Zavetišče Sia in Lu",
      }),
    );

    expect(onInfo).toHaveBeenCalledWith("sia-in-lu");
    // It sits beside the toggle rather than inside it, so the selection is
    // untouched: that is the whole point of the second control.
    expect(onToggle).not.toHaveBeenCalled();
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
    expect(html).toContain('<span class="size-3.5 shrink-0" aria-hidden="true">');
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
    expect(() =>
      render(<ShelterRows rows={linkRows} />),
    ).not.toThrow();
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
