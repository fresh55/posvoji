// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { cleanup, render, fireEvent, waitFor } from "@testing-library/react";
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

    // Each row is one <button>...</button>; find the one that contains the
    // shelter's own label text.
    const rowTag = (label: string) =>
      html.split("<button").find((chunk) => chunk.includes(label)) ?? "";

    expect(rowTag("Sia in Lu")).toContain('data-highlighted="true"');
    expect(rowTag("Mačja hiša")).not.toContain("data-highlighted");
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
  const rowTag = (html: string, label: string) =>
    html.split("<button").find((chunk) => chunk.includes(label)) ?? "";

  it("gives a selected row the map's own accent surface, not the plain hover tint", () => {
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

    // Same token family the map uses for a picked region, so the selected
    // state reads as "chosen" at rest instead of only on hover.
    expect(selected).toContain("var(--filter-accent)");
    expect(selected).toContain("var(--filter-accent-foreground)");
    expect(unselected).not.toContain("var(--filter-accent)");
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
    // map's highlight, not this list's). It never sets `highlighted`, so it
    // can never trigger the scroll on its own.
    const row = getByText("Zavetišče Mačja hiša").closest("button")!;
    fireEvent.pointerEnter(row);

    expect(onHoverRow).toHaveBeenCalledWith("macja-hisa");
    expect(scrollIntoView).not.toHaveBeenCalled();
  });
});
