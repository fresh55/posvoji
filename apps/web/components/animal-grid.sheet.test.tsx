// @vitest-environment jsdom

import type { ComponentProps } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AnimalGrid } from "./animal-grid";
import { I18nProvider } from "./i18n-provider";
import type { FilterSheetContent } from "./filters/filter-sheet-content";
import type { FilterGroupList } from "./filters/filter-groups";
import type { SpeciesTabs } from "./filters/species-tabs";
import type { ClientAnimal } from "@/lib/animal";
import { installFilterFoldSeams } from "@/test/filter-folds";
import { stubIdleCallback, stubMatchMedia } from "@/test/grid-stubs";

type SheetProps = ComponentProps<typeof FilterSheetContent>;
type GroupProps = ComponentProps<typeof FilterGroupList>;
type SpeciesProps = ComponentProps<typeof SpeciesTabs>;
const captured = vi.hoisted(() => ({
  sheet: vi.fn<(props: SheetProps) => void>(),
  groups: vi.fn<(props: GroupProps) => void>(),
  species: vi.fn<(props: SpeciesProps) => void>(),
}));

// Instrument the real components while leaving the actual grid/model and
// memo boundaries in place. This checks the props they receive from the page,
// rather than a harness that hands the sheet pre-stabilized constants.
vi.mock("./filters/filter-sheet-content", async (original) => {
  const actual = await original<typeof import("./filters/filter-sheet-content")>();
  return { ...actual, FilterSheetContent: (props: SheetProps) => {
    captured.sheet(props);
    return <actual.FilterSheetContent {...props} />;
  } };
});
vi.mock("./filters/filter-groups", async (original) => {
  const actual = await original<typeof import("./filters/filter-groups")>();
  return { ...actual, FilterGroupList: (props: GroupProps) => {
    if (props.layout === "sheet") captured.groups(props);
    return <actual.FilterGroupList {...props} />;
  } };
});
vi.mock("./filters/species-tabs", async (original) => {
  const actual = await original<typeof import("./filters/species-tabs")>();
  return { ...actual, SpeciesTabs: (props: SpeciesProps) => {
    if (props.fullWidth) captured.species(props);
    return <actual.SpeciesTabs {...props} />;
  } };
});

// Pre-resolve the deferred content, as the existing grid suite does.
import "./filters/filter-sheet-content";
import "@/test/picker-chunks";

installFilterFoldSeams();
class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= NoopResizeObserver as unknown as typeof ResizeObserver;

beforeEach(() => {
  stubMatchMedia();
  stubIdleCallback();
  window.history.replaceState(null, "", "/");
  captured.sheet.mockClear();
  captured.groups.mockClear();
  captured.species.mockClear();
});
afterEach(async () => {
  cleanup();
  await new Promise((resolve) => setTimeout(resolve, 20));
  window.history.replaceState(null, "", "/");
});

const ANIMALS = ([
  { id: "dog-one", name: "Mila", species: "dog", sex: "female", size: "small", approximateAgeMonths: 12 },
  { id: "dog-two", name: "Rex", species: "dog", sex: "male", size: "large", approximateAgeMonths: 36 },
  { id: "cat-one", name: "Muri", species: "cat", sex: "male", approximateAgeMonths: 24 },
] satisfies Pick<ClientAnimal, "id" | "name" | "species" | "sex" | "size" | "approximateAgeMonths">[]).map((animal): ClientAnimal => ({
  ...animal,
  status: "available",
  medical: { neutered: true },
  goodWith: { kids: "yes" },
  adoptionRequirements: { bondedPair: true },
  shelter: { id: "test-shelter", name: "Test shelter", city: "Ljubljana" },
  images: [],
  attribution: "Test fixture",
}));

it("keeps the actual grid's filter-model props stable and skips unchanged sheet groups on reopening", async () => {
  render(<I18nProvider locale="sl"><AnimalGrid
    animals={ANIMALS} logos={{}} referenceDate="2026-01-01"
  /></I18nProvider>);
  const trigger = await screen.findByRole("button", { name: "Filtri" });
  await act(async () => fireEvent.click(trigger));
  const panel = await screen.findByRole("dialog", { name: "Filtri" });
  const first = captured.sheet.mock.calls.at(-1)![0];
  expect(first.groups.length).toBeGreaterThan(0);
  expect(first.goodWith).toBeDefined();
  expect(first.care).toBeDefined();
  expect(first.counts.sex.get("male")).toBe(2);
  const groupRenders = captured.groups.mock.calls.length;
  const speciesRenders = captured.species.mock.calls.length;
  expect(groupRenders).toBeGreaterThan(0);
  expect(speciesRenders).toBeGreaterThan(0);

  fireEvent.click(within(panel).getByRole("button", { name: "Zapri" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Filtri" })));
  expect(await screen.findByRole("dialog", { name: "Filtri" })).toBe(panel);
  const reopened = captured.sheet.mock.calls.at(-1)![0];
  for (const key of ["filters", "groups", "counts", "toggles", "toggleTally", "goodWith", "care", "unanswered", "onToggle", "onToggleMany", "onToggleProperty", "onToggleManyProperties", "speciesTally", "speciesRoster", "onSpeciesChange"] as const) {
    expect(reopened[key], key).toBe(first[key]);
  }
  expect(captured.groups.mock.calls.length).toBe(groupRenders);
  expect(captured.species.mock.calls.length).toBe(speciesRenders);

  fireEvent.click(within(panel).getByRole("button", { name: /^Psi/ }));
  await waitFor(() => expect(captured.sheet.mock.calls.at(-1)![0].filters.species).toBe("dog"));
  const changed = captured.sheet.mock.calls.at(-1)![0];
  expect(changed.counts).not.toBe(first.counts);
  expect(changed.groups).not.toBe(first.groups);
  expect(changed.counts.sex.get("male")).toBe(1);
  expect(captured.groups.mock.calls.length).toBeGreaterThan(groupRenders);
  expect(captured.species.mock.calls.length).toBeGreaterThan(speciesRenders);
});
