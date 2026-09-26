// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/components/i18n-provider";
import { useAnimalFilters } from "@/hooks/use-animal-filters";
import { resetAnimalDescriptionsStore } from "@/lib/animal-descriptions";
import { GROUPS, parseFilters, type MultiGroup } from "@/lib/filters";
import { getMessages } from "@/lib/i18n";
import {
  AnimalSearchField,
  QUERY_WRITE_DELAY_MS,
} from "./animal-search-field";
import { FilterSheet } from "./filter-sheet";
import { FilterSidebar } from "./filter-sidebar";
// The sheet's body and the picker's chunks, loaded with the file so no test
// waits for them inside its find (test/picker-chunks.ts says why).
import "./filter-sheet-content";
import "@/test/picker-chunks";

const sl = getMessages("sl");

Object.defineProperty(window, "matchMedia", {
  configurable: true,
  value: vi.fn().mockImplementation((media: string) => ({
    matches: false,
    media,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })),
});

Element.prototype.scrollIntoView = vi.fn();

/** The descriptions file, answered empty, so the first key's fetch has
 *  somewhere to go that is not the network. */
let fetchDetails: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchDetails = vi.fn(async () => ({ ok: true, json: async () => ({}) }));
  vi.stubGlobal("fetch", fetchDetails);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  resetAnimalDescriptionsStore();
  window.history.replaceState(null, "", "/");
});

/** The field as the panels mount it: its query read from the address, with
 *  two other writers beside it to move the address from elsewhere. */
function Harness() {
  const { filters, toggle, setQuery } = useAnimalFilters();
  return (
    <>
      <AnimalSearchField query={filters.query} />
      <button type="button" onClick={() => toggle("sex", "male")}>
        Samec
      </button>
      <button type="button" onClick={() => setQuery("")}>
        Pill
      </button>
    </>
  );
}

function renderField() {
  const view = render(
    <I18nProvider locale="sl">
      <Harness />
    </I18nProvider>,
  );
  const field = screen.getByRole("searchbox", { name: sl.searchAnimals });
  return { ...view, field: field as HTMLInputElement };
}

function query() {
  return window.location.search;
}

function typeInto(field: HTMLElement, value: string) {
  fireEvent.change(field, { target: { value } });
}

describe("the search field", () => {
  it("says what it does and what it takes", () => {
    const { field } = renderField();

    expect(field.getAttribute("type")).toBe("search");
    expect(field.getAttribute("placeholder")).toBe(sl.searchPlaceholder);
    expect(field.getAttribute("enterkeyhint")).toBe("search");
    expect(field.getAttribute("autocomplete")).toBe("off");
    expect(field.getAttribute("spellcheck")).toBe("false");
    expect(field.closest('[role="search"]')).toBeTruthy();
    // Nothing to clear yet.
    expect(
      screen.queryByRole("button", { name: sl.clearField }),
    ).toBeNull();
  });

  it("shows each key at once and writes the address once the keys rest", () => {
    vi.useFakeTimers();
    const replace = vi.spyOn(window.history, "replaceState");
    const { field } = renderField();

    for (const text of ["t", "ta", "tar", "tara", "taras"]) {
      typeInto(field, text);
      expect(field.value).toBe(text);
      act(() => {
        vi.advanceTimersByTime(QUERY_WRITE_DELAY_MS - 50);
      });
    }
    expect(query()).toBe("");

    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(query()).toBe("?isci=taras");
    // One write for the whole name, and a replace, like every filter.
    expect(replace).toHaveBeenCalledTimes(1);
    replace.mockRestore();
  });

  it("keeps the space a second word needs while the address holds the query tidied", () => {
    vi.useFakeTimers();
    const { field } = renderField();

    typeInto(field, "taras ");
    act(() => {
      vi.advanceTimersByTime(QUERY_WRITE_DELAY_MS);
    });

    expect(query()).toBe("?isci=taras");
    expect(field.value).toBe("taras ");
  });

  it("asks for the descriptions on the first key, before the write", () => {
    vi.useFakeTimers();
    const { field } = renderField();

    typeInto(field, "m");

    expect(fetchDetails).toHaveBeenCalledWith("/generated/animal-details.json");
    expect(query()).toBe("");
  });

  it("clears at once from its button and keeps the focus", () => {
    vi.useFakeTimers();
    const { field } = renderField();
    typeInto(field, "taras");
    act(() => {
      vi.advanceTimersByTime(QUERY_WRITE_DELAY_MS);
    });

    fireEvent.click(screen.getByRole("button", { name: sl.clearField }));

    expect(query()).toBe("");
    expect(field.value).toBe("");
    expect(document.activeElement).toBe(field);
    expect(
      screen.queryByRole("button", { name: sl.clearField }),
    ).toBeNull();
  });

  it("clears at once on Escape, a write still waiting included", () => {
    vi.useFakeTimers();
    window.history.replaceState(null, "", "/?isci=muri");
    const { field } = renderField();
    typeInto(field, "murijev");

    fireEvent.keyDown(field, { key: "Escape" });
    expect(query()).toBe("");
    expect(field.value).toBe("");

    // The waiting write went with it.
    act(() => {
      vi.advanceTimersByTime(QUERY_WRITE_DELAY_MS);
    });
    expect(query()).toBe("");
  });

  it("writes at once on Enter", () => {
    vi.useFakeTimers();
    const { field } = renderField();
    typeInto(field, "ovčar");

    fireEvent.keyDown(field, { key: "Enter" });

    expect(query()).toBe("?isci=ov%C4%8Dar");
  });

  it("writes what was typed when the focus leaves", () => {
    vi.useFakeTimers();
    const { field } = renderField();
    typeInto(field, "haski");

    fireEvent.blur(field);

    expect(query()).toBe("?isci=haski");
  });

  it("finishes a waiting write when it goes, the way the sheet takes it", () => {
    vi.useFakeTimers();
    const { field, unmount } = renderField();
    typeInto(field, "luna");

    unmount();

    expect(query()).toBe("?isci=luna");
  });

  it("leaves a filter picked during the wait in place", () => {
    vi.useFakeTimers();
    const { field } = renderField();
    typeInto(field, "taras");

    fireEvent.click(screen.getByRole("button", { name: "Samec" }));
    act(() => {
      vi.advanceTimersByTime(QUERY_WRITE_DELAY_MS);
    });

    expect(query()).toBe("?isci=taras&spol=samec");
  });

  it("gives way to a query moved from elsewhere", () => {
    vi.useFakeTimers();
    const { field } = renderField();
    typeInto(field, "taras ");
    act(() => {
      vi.advanceTimersByTime(QUERY_WRITE_DELAY_MS);
    });

    // The pill, Počisti vse or an undo.
    fireEvent.click(screen.getByRole("button", { name: "Pill" }));
    expect(field.value).toBe("");

    // The back button.
    act(() => {
      window.history.replaceState(null, "", "/?isci=muri");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(field.value).toBe("muri");
  });
});

const emptyCounts = Object.fromEntries(
  GROUPS.map((group) => [group, new Map()]),
) as Record<MultiGroup, Map<string, number>>;

const filterActions = {
  onToggle: vi.fn(),
  onToggleMany: vi.fn(),
  onToggleProperty: vi.fn(),
  onToggleManyProperties: vi.fn(),
};

const scopeOptions = [
  { value: "jug", label: "Zavetišče Jug", city: "Ljubljana" },
];

describe("the search in the panels", () => {
  it("sits under the panel's heading and above Kje", () => {
    render(
      <I18nProvider locale="sl">
        <FilterSidebar
          filters={parseFilters("?isci=taras")}
          groups={[]}
          counts={emptyCounts}
          toggles={[]}
          toggleTally={new Map()}
          scope={{
            options: scopeOptions,
            counts: new Map([["jug", 3]]),
            resultCount: 3,
          }}
          {...filterActions}
        />
      </I18nProvider>,
    );

    const panel = screen.getByRole("complementary");
    const heading = within(panel).getByRole("heading", { name: /Filtri/ });
    const search = within(panel).getByRole("search");
    const where = panel.querySelector('[data-slot="location-scope-row"]')!;
    expect(heading.nextElementSibling).toBe(search);
    expect(search.nextElementSibling).toBe(where);
    expect(
      within(search).getByRole<HTMLInputElement>("searchbox").value,
    ).toBe("taras");
    // Counted on the heading's badge like any other value.
    expect(heading.textContent).toContain("1");
  });

  it("leads the phone's sheet, which opens with the keyboard down", async () => {
    render(<SheetHarness />);
    const dialog = await openSheet();

    const body = dialog.querySelector(".overflow-y-auto")!;
    const search = within(dialog).getByRole("search");
    expect(body.firstElementChild).toBe(search);
    // Focus lands on the sheet's close button, not in the field, so opening
    // the sheet does not throw a keyboard over it.
    expect(document.activeElement).not.toBe(
      within(search).getByRole("searchbox"),
    );
  });

  it("takes the first Escape in the sheet for itself and leaves the second to the sheet", async () => {
    render(<SheetHarness />);
    const dialog = await openSheet();
    const field = within(dialog).getByRole<HTMLInputElement>("searchbox");
    act(() => field.focus());
    typeInto(field, "taras");

    fireEvent.keyDown(field, { key: "Escape" });
    expect(field.value).toBe("");
    expect(dialog.getAttribute("data-state")).toBe("open");

    fireEvent.keyDown(field, { key: "Escape" });
    expect(dialog.getAttribute("data-state")).not.toBe("open");
  });
});

/** The sheet with its filters read from the address, as the grid hands them
 *  down. */
function SheetHarness() {
  const { filters, clearAll, setSpecies } = useAnimalFilters();
  return (
    <I18nProvider locale="sl">
      <FilterSheet
        sort="longest-in-shelter"
        onSortChange={vi.fn()}
        filters={filters}
        groups={[]}
        counts={emptyCounts}
        toggles={[]}
        toggleTally={new Map()}
        activeCount={filters.query === "" ? 0 : 1}
        resultCount={3}
        onSpeciesChange={setSpecies}
        onClearAll={clearAll}
        {...filterActions}
      />
    </I18nProvider>
  );
}

async function openSheet() {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /^Filtri/ }));
  });
  return screen.findByRole("dialog");
}
