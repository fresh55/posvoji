// @vitest-environment jsdom

import { act, fireEvent, render, screen } from "@testing-library/react";
import type { Animal } from "@posvoji/schema";
import { afterEach, describe, expect, it } from "vitest";
import { I18nProvider } from "@/components/i18n-provider";
import { useAnimalFilters } from "@/hooks/use-animal-filters";
import {
  applyFilters,
  careCounts,
  careOptions,
  facetCounts,
  goodWithCounts,
  goodWithOptions,
  GROUPS,
  groupOptions,
  optionLabel,
  toggleCounts,
  toggleLabel,
  visibleCare,
  visibleGoodWith,
  visibleGroups,
  visibleToggles,
  type AgeGroup,
  type SpeciesFilter,
} from "@/lib/filters";
import { careLabel, goodWithChipLabel } from "@/lib/labels";
import { DEFAULT_ANIMAL_SORT, type AnimalSort } from "@/lib/sort";
import {
  installFilterFoldSeams,
  openAllFilterSections,
} from "@/test/filter-folds";
import { FilterChips, type Chip } from "./filter-chips";
import { FilterGroupList, type CardGroup } from "./filter-groups";

installFilterFoldSeams();

afterEach(() => {
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
  goodWith: Animal["goodWith"] = undefined,
  // Lahko ponudim reads two fields, so they ride along rather than adding two
  // more positional arguments nobody passes.
  extra: Partial<Pick<Animal, "adoptionRequirements" | "specialNeeds">> = {},
): Animal {
  return {
    ...(goodWith ? { goodWith } : {}),
    ...extra,
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
  animal(
    "male-young",
    "male",
    6,
    "small",
    { neutered: true },
    { kids: "yes", dogs: "yes" },
    { adoptionRequirements: { bondedPair: true } },
  ),
  animal(
    "female-adult",
    "female",
    36,
    "medium",
    // Both traits, so Zdravje's AND has an animal to narrow to.
    { vaccinated: true, neutered: true },
    { kids: "yes", dogs: "no" },
    // The only animal both rows answer yes for, so the two can be combined
    // without either card going dead first.
    { adoptionRequirements: { bondedPair: true }, specialNeeds: true },
  ),
  animal("male-senior", "male", 120, "large"),
];

function FilterFlowHarness() {
  const {
    filters,
    sort,
    setSpecies,
    toggle,
    toggleMany,
    toggleProperty,
    toggleManyProperties,
    toggleGoodWith,
    toggleManyGoodWith,
    toggleCare,
    toggleManyCare,
    setSort,
    clearAll,
  } = useAnimalFilters();
  const matching = applyFilters(ANIMALS, filters, NOW);
  const shown = visibleGroups(ANIMALS, filters, NOW);
  const groups = GROUPS.filter(
    (group): group is CardGroup => group !== "shelter" && shown[group],
  ).map((group) => ({
    group,
    options: groupOptions(group, ANIMALS, "sl"),
  }));
  const toggles = visibleToggles(ANIMALS, filters.species, filters.toggles).map(
    (definition) => ({
      ...definition,
      label: toggleLabel(definition.key, "sl"),
    }),
  );
  const chips: Chip[] = [
    ...GROUPS.flatMap((group) =>
      filters[group].map((value) => ({
        key: `${group}:${value}`,
        facet: group,
        value,
        label: optionLabel(group, value, ANIMALS, "sl"),
        onRemove: () => toggle(group, value),
      })),
    ),
    ...filters.toggles.map((key) => ({
      key: `toggle:${key}`,
      facet: "toggles" as const,
      value: key,
      label: toggleLabel(key, "sl"),
      onRemove: () => toggleProperty(key),
    })),
    ...filters.goodWith.map((key) => ({
      key: `goodWith:${key}`,
      facet: "goodWith" as const,
      value: key,
      label: goodWithChipLabel(key, "sl"),
      onRemove: () => toggleGoodWith(key),
    })),
    ...filters.care.map((key) => ({
      key: `care:${key}`,
      facet: "care" as const,
      value: key,
      label: careLabel(key, "sl"),
      onRemove: () => toggleCare(key),
    })),
  ];
  const goodWithKeys = visibleGoodWith(ANIMALS, filters.goodWith);
  const goodWith = {
    options: goodWithOptions("sl").filter(({ key }) =>
      goodWithKeys.includes(key),
    ),
    counts: goodWithCounts(ANIMALS, filters, NOW),
    resultCount: matching.length,
    total: ANIMALS.length,
    onToggle: toggleGoodWith,
    onToggleMany: toggleManyGoodWith,
  };
  const careKeys = visibleCare(ANIMALS, filters.care);
  const care = {
    options: careOptions("sl").filter(({ key }) => careKeys.includes(key)),
    counts: careCounts(ANIMALS, filters, NOW),
    resultCount: matching.length,
    total: ANIMALS.length,
    onToggle: toggleCare,
    onToggleMany: toggleManyCare,
  };

  return (
    <I18nProvider locale="sl">
      <main>
        <FilterGroupList
          filters={filters}
          groups={groups}
          counts={facetCounts(ANIMALS, filters, NOW)}
          toggles={toggles}
          toggleTally={toggleCounts(ANIMALS, filters, NOW)}
          goodWith={goodWith}
          care={care}
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
        <output data-testid="sort">{sort}</output>
        {(["newest-arrivals", "name"] as AnimalSort[]).map((option) => (
          <button key={option} onClick={() => setSort(option)}>
            {`Razvrsti: ${option}`}
          </button>
        ))}
        <button onClick={() => setSort(DEFAULT_ANIMAL_SORT)}>
          Razvrsti privzeto
        </button>
        {/* The species strip, as the one thing the hook exposes that writes a
            history entry of its own. The tabs themselves are asserted in
            species-tabs.test.tsx; what matters here is the write. */}
        {(["all", "cat", "dog"] as SpeciesFilter[]).map((option) => (
          <button key={option} onClick={() => setSpecies(option)}>
            {`Vrsta: ${option}`}
          </button>
        ))}
      </main>
    </I18nProvider>
  );
}

function renderFilters() {
  const result = render(<FilterFlowHarness />);
  // Every section but Spol and Starost folds closed (use-filter-sections.ts),
  // and these tests press the options inside them.
  openAllFilterSections();
  return result;
}

function query() {
  return screen.getByTestId("query").textContent;
}

function matchingIds() {
  return screen.getByTestId("matching-ids").textContent;
}

function sortValue() {
  return screen.getByTestId("sort").textContent;
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

  // Every health trait ticked has to hold: Sterilizacija keeps both neutered
  // animals, and Cepljenje on top of it leaves the one that has both.
  it("requires every health trait ticked", () => {
    renderFilters();
    fireEvent.click(screen.getByRole("button", { name: /^Sterilizacija/ }));
    expect(matchingIds()).toBe("male-young,female-adult");

    fireEvent.click(screen.getByRole("button", { name: /^Cepljenje/ }));
    expect(matchingIds()).toBe("female-adult");
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

  it("combines household answers with AND and says so on screen", () => {
    renderFilters();
    fireEvent.click(screen.getByRole("button", { name: /^Otroke, / }));
    expect(matchingIds()).toBe("male-young,female-adult");

    fireEvent.click(screen.getByRole("button", { name: /^Psa, / }));
    expect(matchingIds()).toBe("male-young");
    expect(
      screen.getByText(
        "Prikazane so živali, ki se razumejo z otroki in psi. 1 od 3. Živali brez odgovora zavetišča so skrite.",
      ),
    ).toBeTruthy();
  });

  it("keeps the household slugs a shared link already carries", () => {
    renderFilters();
    fireEvent.click(screen.getByRole("button", { name: /^Otroke, / }));
    fireEvent.click(screen.getByRole("button", { name: /^Psa, / }));

    expect(query()).toBe("?druzba=otroci,psi");
  });

  it("names the household on its chips, not the species", () => {
    renderFilters();
    fireEvent.click(screen.getByRole("button", { name: /^Otroke, / }));
    fireEvent.click(screen.getByRole("button", { name: /^Psa, / }));

    expect(screen.getByText("Doma: otroci")).toBeTruthy();
    expect(screen.getByText("Doma: pes")).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: "Odstrani filter Doma: pes" }),
    );
    expect(query()).toBe("?druzba=otroci");
  });

  it("narrows to the animals that go as a pair and says so on screen", () => {
    renderFilters();
    fireEvent.click(
      screen.getByRole("button", { name: /^Dom za dva, / }),
    );

    expect(pressed(/^Dom za dva, /)).toBe("true");
    expect(matchingIds()).toBe("male-young,female-adult");
    expect(query()).toBe("?skrb=posvojitev-v-paru");
    expect(
      screen.getByText(
        "Prikazane so živali, ki potrebujejo, kar lahko ponudiš. 2 od 3.",
      ),
    ).toBeTruthy();
  });

  it("names which animals each row shows before anything is ticked", () => {
    renderFilters();
    const row = screen.getByRole("button", { name: /^Potrpežljivost, / });
    const description = document.getElementById(
      row.getAttribute("aria-describedby") ?? "",
    );
    expect(description?.textContent).toBe("Plahe ali občutljive živali");
  });

  it("narrows to the animals that need patience", () => {
    renderFilters();
    fireEvent.click(
      screen.getByRole("button", { name: /^Potrpežljivost, / }),
    );

    expect(matchingIds()).toBe("female-adult");
    expect(query()).toBe("?skrb=potrpezljiv");
    expect(
      screen.getByText(
        "Prikazane so živali, ki potrebujejo, kar lahko ponudiš. 1 od 3.",
      ),
    ).toBeTruthy();
  });

  it("puts each row on the chips row and takes it off again", () => {
    renderFilters();
    fireEvent.click(
      screen.getByRole("button", { name: /^Dom za dva, / }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: /^Potrpežljivost, / }),
    );
    expect(query()).toBe("?skrb=posvojitev-v-paru,potrpezljiv");
    // Either is enough, so both ticked shows what either one did.
    expect(matchingIds()).toBe("male-young,female-adult");

    fireEvent.click(
      screen.getByRole("button", {
        name: "Odstrani filter Dom za dve živali",
      }),
    );
    expect(query()).toBe("?skrb=potrpezljiv");

    fireEvent.click(
      screen.getByRole("button", {
        name: "Odstrani filter Potrpežljivost",
      }),
    );
    expect(query()).toBe("");
  });

  it("resets and clears the section", () => {
    renderFilters();
    fireEvent.click(
      screen.getByRole("button", { name: /^Dom za dva, / }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: /^Potrpežljivost, / }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Ponastavi, kar lahko ponudim" }),
    );
    expect(query()).toBe("");

    fireEvent.click(
      screen.getByRole("button", { name: /^Potrpežljivost, / }),
    );
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

  it("writes and reads the sort order through the URL, keeping the default clean", () => {
    renderFilters();
    expect(sortValue()).toBe("longest-in-shelter");
    expect(query()).toBe("");

    fireEvent.click(
      screen.getByRole("button", { name: "Razvrsti: newest-arrivals" }),
    );
    expect(sortValue()).toBe("newest-arrivals");
    expect(query()).toBe("?razvrsti=novi");

    fireEvent.click(screen.getByRole("button", { name: "Razvrsti privzeto" }));
    expect(sortValue()).toBe("longest-in-shelter");
    expect(query()).toBe("");
  });

  it("hydrates the sort order from a deep link", () => {
    window.history.replaceState(null, "", "/?razvrsti=ime");
    renderFilters();
    expect(sortValue()).toBe("name");
  });

  it("falls back to the default sort for an unknown razvrsti slug", () => {
    window.history.replaceState(null, "", "/?razvrsti=neznano");
    renderFilters();
    expect(sortValue()).toBe("longest-in-shelter");
  });

  it("combines a chosen sort with active filters in one query", () => {
    renderFilters();
    fireEvent.click(screen.getByRole("button", { name: /^Samica/ }));
    fireEvent.click(
      screen.getByRole("button", { name: "Razvrsti: newest-arrivals" }),
    );

    expect(query()).toBe("?spol=samica&razvrsti=novi");
  });

  it("keeps a foreign param a filter toggle does not know about", () => {
    window.history.replaceState(null, "", "/?najdena=1");
    renderFilters();

    fireEvent.click(screen.getByRole("button", { name: /^Samica/ }));

    expect(query()).toBe("?najdena=1&spol=samica");
  });

  it("keeps a foreign param a sort change does not know about", () => {
    window.history.replaceState(null, "", "/?najdena=1");
    renderFilters();

    fireEvent.click(
      screen.getByRole("button", { name: "Razvrsti: newest-arrivals" }),
    );

    expect(query()).toBe("?najdena=1&razvrsti=novi");
  });

  it("preserves history.state across a filter write", () => {
    window.history.pushState({ animal: true }, "", "/");
    renderFilters();

    fireEvent.click(screen.getByRole("button", { name: /^Samica/ }));

    expect(window.history.state).toEqual({ animal: true });
  });

  it("gives a species its own history entry, so back undoes the press", () => {
    // On a phone the species strip is very often the last thing pressed
    // before the back gesture, and on replace that gesture pointed at
    // whatever page came before the results: arriving from /zavetisca,
    // pressing Mačke and going back left the list entirely.
    window.history.replaceState(null, "", "/");
    renderFilters();
    const before = window.history.length;

    fireEvent.click(screen.getByRole("button", { name: "Vrsta: cat" }));

    expect(query()).toBe("?vrsta=macka");
    expect(window.history.length).toBe(before + 1);
  });

  it("keeps every other filter on one entry", () => {
    // A sidebar toggle is an adjustment to the list already on screen, and an
    // entry per checkbox would turn the back button into a log of every box
    // ticked. Sort is the same.
    renderFilters();
    const before = window.history.length;

    fireEvent.click(screen.getByRole("button", { name: /^Samica/ }));
    fireEvent.click(
      screen.getByRole("button", { name: "Razvrsti: newest-arrivals" }),
    );

    expect(query()).toBe("?spol=samica&razvrsti=novi");
    expect(window.history.length).toBe(before);
  });

  it("carries history.state onto the entry a species push writes", () => {
    // A bare pushState writes null, which would throw away whatever the entry
    // the visitor is standing on was carrying.
    window.history.pushState({ scrolled: 120 }, "", "/");
    renderFilters();

    fireEvent.click(screen.getByRole("button", { name: "Vrsta: dog" }));

    expect(query()).toBe("?vrsta=pes");
    expect(window.history.state).toEqual({ scrolled: 120 });
  });

  it("stacks no entry under an open animal", () => {
    // Back closes the dialog in one press. An entry under it would spend that
    // press undoing a filter change behind a card nobody can see past
    // (animal-dialog.test.tsx has the whole flow).
    window.history.pushState({ animal: true }, "", "/");
    renderFilters();
    const before = window.history.length;

    fireEvent.click(screen.getByRole("button", { name: "Vrsta: dog" }));

    expect(query()).toBe("?vrsta=pes");
    expect(window.history.length).toBe(before);
    expect(window.history.state).toEqual({ animal: true });
  });

  it("writes the species in place while a sheet is open", () => {
    // The filter sheet repeats the chosen species as a pill that sets it back
    // to all, and the sheet stands on an entry its back gesture pops
    // (use-picker-history.ts). A push from inside it would carry the sheet's
    // marker onto a second entry, and back would then undo the species
    // before closing the sheet.
    window.history.replaceState(null, "", "/?vrsta=macka");
    window.history.pushState({ locationPicker: "sheet:1" }, "", "/?vrsta=macka");
    renderFilters();
    const before = window.history.length;

    fireEvent.click(screen.getByRole("button", { name: "Vrsta: all" }));

    expect(query()).toBe("");
    expect(window.history.length).toBe(before);
    expect(window.history.state).toEqual({ locationPicker: "sheet:1" });
  });

  it("keeps the species when everything else is cleared", () => {
    // The species is the scope the list is read in, chosen outside the sheet
    // and not counted by its badge. A clear that reset it was a button inside
    // the sheet undoing a choice made outside it, behind the sheet where the
    // strip cannot be seen: pressing Mačke, narrowing and clearing lands on
    // every cat again, not on every animal.
    window.history.replaceState(null, "", "/?vrsta=macka&spol=samica");
    renderFilters();

    fireEvent.click(screen.getByRole("button", { name: "Počisti filtre" }));

    expect(query()).toBe("?vrsta=macka");
  });

  it("writes no entry for the species already chosen", () => {
    // The strip reports a press on the tab that is already pressed, and an
    // entry for a write that changes no part of the query is a back press
    // that appears to do nothing.
    window.history.replaceState(null, "", "/?vrsta=macka");
    renderFilters();
    const before = window.history.length;

    fireEvent.click(screen.getByRole("button", { name: "Vrsta: cat" }));

    expect(query()).toBe("?vrsta=macka");
    expect(window.history.length).toBe(before);
  });
});
