// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PortalListTools,
  filterPortalAnimals,
  type PortalListEntry,
} from "@/components/portal/list-tools";
import { STATUS_META } from "@/components/portal/portal-fields";
import { portalText } from "@/components/portal/portal-text";

afterEach(cleanup);

function entry(overrides: Partial<PortalListEntry> = {}): PortalListEntry {
  return {
    id: "testno:1",
    name: "Muri",
    breed: null,
    status: "available",
    ...overrides,
  };
}

const LIST: PortalListEntry[] = [
  entry({ id: "testno:1", name: "Muri" }),
  entry({ id: "testno:2", name: "Žan", status: "reserved" }),
  entry({ id: "testno:3", name: "Bela" }),
];

describe("filterPortalAnimals", () => {
  it("hands back the same list when nothing is asked of it", () => {
    expect(filterPortalAnimals(LIST, "", null)).toBe(LIST);
  });

  it("keeps only the entries the review predicate claims", () => {
    const visible = filterPortalAnimals(
      LIST,
      "",
      "review",
      (animal) => animal.id !== "testno:2",
    );

    expect(visible.map((animal) => animal.id)).toEqual([
      "testno:1",
      "testno:3",
    ]);
  });

  it("leaves the review filter empty when there is no predicate", () => {
    // A manual shelter writes its own records, so nothing on that list is
    // waiting for a shelter's answer and the chip is never offered.
    expect(filterPortalAnimals(LIST, "", "review")).toEqual([]);
  });

  it("keeps the query an and over the review filter", () => {
    const visible = filterPortalAnimals(LIST, "bel", "review", () => true);

    expect(visible.map((animal) => animal.id)).toEqual(["testno:3"]);
  });

  it("still filters by a status, ignoring the predicate", () => {
    const visible = filterPortalAnimals(LIST, "", "reserved", () => false);

    expect(visible.map((animal) => animal.id)).toEqual(["testno:2"]);
  });
});

describe("the review chip", () => {
  function tools(props: Partial<Parameters<typeof PortalListTools>[0]> = {}) {
    const onFilterChange = vi.fn();
    render(
      <PortalListTools
        animals={LIST}
        query=""
        onQueryChange={vi.fn()}
        filter={null}
        onFilterChange={onFilterChange}
        reviewCount={2}
        {...props}
      />,
    );
    return { onFilterChange };
  }

  const reviewChip = () =>
    screen.queryByRole("button", {
      name: new RegExp(portalText.reviewChip),
    });

  it("says how many animals are waiting and turns the filter on", () => {
    const { onFilterChange } = tools();

    const chip = reviewChip();
    expect(chip?.textContent).toContain("2");

    fireEvent.click(chip!);
    expect(onFilterChange).toHaveBeenCalledWith("review");
  });

  it("sits between Vse and the statuses", () => {
    tools();

    const chips = screen
      .getAllByRole("button")
      .map((button) => button.textContent ?? "");
    expect(chips[0]).toContain(portalText.statusAll);
    expect(chips[1]).toContain(portalText.reviewChip);
    expect(chips[2]).toContain(STATUS_META.available.label);
  });

  it("is not offered to a list that has no count for it", () => {
    tools({ reviewCount: undefined });

    expect(reviewChip()).toBeNull();
  });

  it("is not offered while there is nothing to review", () => {
    tools({ reviewCount: 0 });

    expect(reviewChip()).toBeNull();
  });

  it("stays on screen at zero while it is the filter, and switches back off", () => {
    const { onFilterChange } = tools({ reviewCount: 0, filter: "review" });

    const chip = reviewChip();
    expect(chip?.getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(chip!);
    expect(onFilterChange).toHaveBeenCalledWith(null);
  });
});
