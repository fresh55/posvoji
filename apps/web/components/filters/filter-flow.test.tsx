// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Animal } from "@posvoji/schema";
import { afterEach, describe, expect, it } from "vitest";
import { I18nProvider } from "@/components/i18n-provider";
import { useAnimalFilters } from "@/hooks/use-animal-filters";
import {
  applyFilters,
  facetCounts,
  GROUPS,
  groupOptions,
  optionLabel,
  toggleCounts,
  toggleLabel,
  visibleGroups,
  visibleToggles,
  type AgeGroup,
} from "@/lib/filters";
import { FilterChips, type Chip } from "./filter-chips";
import { FilterGroupList, type CardGroup } from "./filter-groups";

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
});

const NOW = new Date("2026-01-01T00:00:00.000Z");
const AGE_GROUPS: AgeGroup[] = ["mladicek", "odrasel", "senior"];
const AGE_LABELS: Record<AgeGroup, string> = {
  mladicek: "Mladiček",
  odrasel: "Odrasel",
  senior: "Senior",
};

function animal(
  id: string,
  sex: "male" | "female",
  approximateAgeMonths: number,
  size: "small" | "medium" | "large",
  medical: Animal["medical"] = {},
): Animal {
  return {
    id,
    source: {
      providerId: "test-shelter",
      sourceAnimalId: id,
      sourceUrl: `https://example.test/animals/${id}`,
      fetchedAt: "2026-01-01T00:00:00.000Z",
      firstSeenAt: "2026-01-01T00:00:00.000Z",
      lastSeenAt: "2026-01-01T00:00:00.000Z",
    },
    shelter: { id: "test-shelter", name: "Test shelter", city: "Ljubljana" },
    name: id,
    species: "dog",
    sex,
    size,
    approximateAgeMonths,
    status: "available",
    medical,
    images: [],
    attribution: "Test fixture",
  };
}

const ANIMALS = [
  animal("male-young", "male", 6, "small", { neutered: true }),
  animal("female-adult", "female", 36, "medium", { vaccinated: true }),
  animal("male-senior", "male", 120, "large"),
];

function FilterFlowHarness() {
  const {
    filters,
    toggle,
    toggleMany,
    toggleProperty,
    toggleManyProperties,
    clearAll,
  } = useAnimalFilters();
  const matching = applyFilters(ANIMALS, filters, NOW);
  const shown = visibleGroups(ANIMALS, filters.species, NOW);
  const groups = GROUPS.filter(
    (group): group is CardGroup => group !== "shelter" && shown[group],
  ).map((group) => ({
    group,
    options: groupOptions(group, ANIMALS, "sl"),
  }));
  const toggles = visibleToggles(ANIMALS, filters.species).map((definition) => ({
    ...definition,
    label: toggleLabel(definition.key, "sl"),
  }));
  const chips: Chip[] = [
    ...GROUPS.flatMap((group) =>
      filters[group].map((value) => ({
        key: `${group}:${value}`,
        label: optionLabel(group, value, ANIMALS, "sl"),
        onRemove: () => toggle(group, value),
      })),
    ),
    ...filters.toggles.map((key) => ({
      key: `toggle:${key}`,
      label: toggleLabel(key, "sl"),
      onRemove: () => toggleProperty(key),
    })),
  ];

  return (
    <I18nProvider locale="sl">
      <main>
        <FilterGroupList
          filters={filters}
          groups={groups}
          counts={facetCounts(ANIMALS, filters, NOW)}
          toggles={toggles}
          toggleTally={toggleCounts(ANIMALS, filters, NOW)}
          onToggle={toggle}
          onToggleMany={toggleMany}
          onToggleProperty={toggleProperty}
          onToggleManyProperties={toggleManyProperties}
        />
        <FilterChips chips={chips} onClearAll={clearAll} />
        <output data-testid="matching-ids">
          {matching.map(({ id }) => id).join(",")}
        </output>
        <output data-testid="query">{window.location.search}</output>
      </main>
    </I18nProvider>
  );
}

function renderFilters() {
  return render(<FilterFlowHarness />);
}

function query() {
  return screen.getByTestId("query").textContent;
}

function matchingIds() {
  return screen.getByTestId("matching-ids").textContent;
}

function pressed(name: RegExp) {
  return screen.getByRole("button", { name }).getAttribute("aria-pressed");
}

describe("filter flow interactions", () => {
  it("keeps both sex choices selected and combines them with OR", () => {
    renderFilters();
    fireEvent.click(screen.getByRole("button", { name: /^Samec/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Samica/ }));

    expect(pressed(/^Samec/)).toBe("true");
    expect(pressed(/^Samica/)).toBe("true");
    expect(matchingIds()).toBe("male-young,female-adult,male-senior");
    expect(query()).toBe("?spol=samec,samica");
  });

  it("keeps all ages selected and shareable", () => {
    renderFilters();
    for (const value of AGE_GROUPS) {
      fireEvent.click(
        screen.getByRole("button", { name: new RegExp(`^${AGE_LABELS[value]}`) }),
      );
    }

    for (const value of AGE_GROUPS) {
      expect(pressed(new RegExp(`^${AGE_LABELS[value]}`))).toBe("true");
    }
    expect(query()).toBe("?starost=mladicek,odrasel,senior");
  });

  it("uses OR semantics for multiple health traits", () => {
    renderFilters();
    fireEvent.click(screen.getByRole("button", { name: /^Sterilizacija/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Cepljenje/ }));

    expect(matchingIds()).toBe("male-young,female-adult");
    expect(query()).toBe("?lastnosti=sterilizacija,cepljenje");
  });

  it("removes one chip without clearing its section", () => {
    renderFilters();
    fireEvent.click(screen.getByRole("button", { name: /^Samec/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Samica/ }));
    fireEvent.click(screen.getByRole("button", { name: "Odstrani filter Samec" }));

    expect(pressed(/^Samec/)).toBe("false");
    expect(pressed(/^Samica/)).toBe("true");
    expect(query()).toBe("?spol=samica");
  });

  it("resets every section independently", () => {
    renderFilters();
    const selections: [RegExp, RegExp, string][] = [
      [/^Samec/, /^Samica/, "Ponastavi filter spola"],
      [/^Mladiček/, /^Odrasel/, "Ponastavi filter starosti"],
      [/^Majhna/, /^Srednja/, "Ponastavi filter velikosti"],
      [/^Sterilizacija/, /^Cepljenje/, "Ponastavi zdravstvene filtre"],
    ];

    for (const [first, second, reset] of selections) {
      fireEvent.click(screen.getByRole("button", { name: first }));
      fireEvent.click(screen.getByRole("button", { name: second }));
      fireEvent.click(screen.getByRole("button", { name: reset }));
      expect(query()).toBe("");
    }
  });

  it("clears all selected sections", () => {
    renderFilters();
    fireEvent.click(screen.getByRole("button", { name: /^Samec/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Sterilizacija/ }));
    fireEvent.click(screen.getByRole("button", { name: "Počisti filtre" }));

    expect(matchingIds()).toBe("male-young,female-adult,male-senior");
    expect(query()).toBe("");
  });

  it("hydrates and reacts to shared URL state", () => {
    window.history.replaceState(null, "", "/?spol=samica&starost=odrasel");
    renderFilters();
    expect(matchingIds()).toBe("female-adult");

    window.history.pushState(null, "", "/?spol=samec&lastnosti=sterilizacija");
    act(() => window.dispatchEvent(new PopStateEvent("popstate")));
    expect(matchingIds()).toBe("male-young");
    expect(query()).toBe("?spol=samec&lastnosti=sterilizacija");
  });
});
