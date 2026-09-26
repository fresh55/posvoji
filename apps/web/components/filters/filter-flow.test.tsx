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
  valueChipLabel,
  visibleCare,
  visibleGoodWith,
  visibleGroups,
  visibleToggles,
  type AgeGroup,
  type SpeciesFilter,
} from "@/lib/filters";
import { goodWithChipLabel } from "@/lib/labels";
import { DEFAULT_ANIMAL_SORT, type AnimalSort } from "@/lib/sort";
import {
  installFilterFoldSeams,
  openAllFilterSections,
} from "@/test/filter-folds";
import { FilterChips, type Chip } from "./filter-chips";
import { FilterGroupList, type CardGroup } from "./filter-groups";

installFilterFoldSeams();
// fireEvent's click carries detail 0, which is a keyboard's, so a reset
// pressed here hands focus to its section's heading, and a heading with a hint
// opens its tooltip on focus. Radix positions it with an observer jsdom does
// not ship.
class NoopResizeObserver { observe() {} unobserve() {} disconnect() {} }
globalThis.ResizeObserver ??= NoopResizeObserver as unknown as typeof ResizeObserver;

afterEach(() => {
  window.history.replaceState(null, "", "/");
});

const NOW = new Date("2026-01-01T00:00:00.000Z");
const AGE_GROUPS: AgeGroup[] = ["mladicek", "mlad", "odrasel", "senior"];
const AGE_LABELS: Record<AgeGroup, string> = {
  mladicek: "Mladiček",
  mlad: "Mlad",
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

// Two, so Mlad has an animal to pick. Kept out of ANIMALS, whose three are
// what every other count and sentence in this file is written against.
const YOUNG_ADULT = animal("female-young", "female", 20, "small");

function FilterFlowHarness({ animals = ANIMALS }: { animals?: Animal[] }) {
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
  const matching = applyFilters(animals, filters, NOW);
  const shown = visibleGroups(animals, filters, NOW);
  const groups = GROUPS.filter(
    (group): group is CardGroup => group !== "shelter" && shown[group],
  ).map((group) => ({
    group,
    options: groupOptions(group, animals, "sl"),
  }));
  const toggles = visibleToggles(animals, filters.species, filters.toggles).map(
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
        label: optionLabel(group, value, animals, "sl"),
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
      label: valueChipLabel("care", key, "sl"),
      onRemove: () => toggleCare(key),
    })),
  ];
  const goodWithKeys = visibleGoodWith(animals, filters.goodWith);
  const goodWith = {
    options: goodWithOptions("sl").filter(({ key }) =>
      goodWithKeys.includes(key),
    ),
    counts: goodWithCounts(animals, filters, NOW),
    resultCount: matching.length,
    total: animals.length,
    onToggle: toggleGoodWith,
    onToggleMany: toggleManyGoodWith,
  };
  const careKeys = visibleCare(animals, filters.care);
  const care = {
    options: careOptions("sl").filter(({ key }) => careKeys.includes(key)),
    counts: careCounts(animals, filters, NOW),
    resultCount: matching.length,
    total: animals.length,
    onToggle: toggleCare,
    onToggleMany: toggleManyCare,
  };

  return (
    <I18nProvider locale="sl">
      <main>
        <FilterGroupList
          filters={filters}
          groups={groups}
          counts={facetCounts(animals, filters, NOW)}
          toggles={toggles}
          toggleTally={toggleCounts(animals, filters, NOW)}
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

function renderFilters(animals: Animal[] = ANIMALS) {
  const result = render(<FilterFlowHarness animals={animals} />);
  // Every section but Starost, and Velikost on Psi, folds closed
  // (use-filter-sections.ts), and these tests press the options inside them.
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

  // The comma after the label: "Mlad" alone also starts "Mladiček".
  it("keeps all ages selected and shareable", () => {
    renderFilters([...ANIMALS, YOUNG_ADULT]);
    for (const value of AGE_GROUPS) {
      fireEvent.click(
        screen.getByRole("button", { name: new RegExp(`^${AGE_LABELS[value]},`) }),
      );
    }

    for (const value of AGE_GROUPS) {
      expect(pressed(new RegExp(`^${AGE_LABELS[value]},`))).toBe("true");
    }
    expect(query()).toBe("?starost=mladicek,mlad,odrasel,senior");
  });

  it("narrows to the young stage and shares it as mlad", () => {
    renderFilters([...ANIMALS, YOUNG_ADULT]);
    fireEvent.click(screen.getByRole("button", { name: /^Mlad,/ }));

    expect(pressed(/^Mlad,/)).toBe("true");
    expect(pressed(/^Mladiček,/)).toBe("false");
    expect(matchingIds()).toBe("female-young");
    expect(query()).toBe("?starost=mlad");
    expect(
      screen.getByRole("button", { name: "Odstrani filter Mlad" }),
    ).toBeTruthy();
  });

  // Sterilisation, vaccination and the chip stay facts on the animal and are
  // no longer asked here: the fixture records all three and the panel offers
  // none of them. FIV and FeLV, the two it does offer, are cat questions, and
  // this fixture is dogs (lib/filters.test.ts covers their AND).
  it("offers no health toggle a dog could be asked", () => {
    renderFilters();
    expect(screen.queryByRole("button", { name: /^Sterilizacija/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Cepljenje/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Zdravje/ })).toBeNull();
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
    fireEvent.click(screen.getByRole("button", { name: /^Majhna/ }));
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
        "Prikazane so živali, ki se razumejo z otroki in psi: 1 od 3. Živali brez podatka so skrite.",
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
        "Prikazane so živali, ki potrebujejo, kar lahko ponudiš: 2 od 3.",
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
        "Prikazane so živali, ki potrebujejo, kar lahko ponudiš: 1 od 3.",
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

    window.history.pushState(null, "", "/?spol=samec&starost=mladicek");
    act(() => window.dispatchEvent(new PopStateEvent("popstate")));
    expect(matchingIds()).toBe("male-young");
    expect(query()).toBe("?spol=samec&starost=mladicek");
  });

  it("lets a link carrying a retired health toggle narrow by the rest alone", () => {
    // Shared while Sterilizacija was a filter. It narrowed to the shelters that
    // publish the fact; now it narrows by nothing, and the next write drops it
    // from the address rather than carrying it around.
    window.history.replaceState(null, "", "/?spol=samec&lastnosti=sterilizacija");
    renderFilters();
    expect(matchingIds()).toBe("male-young,male-senior");

    fireEvent.click(screen.getByRole("button", { name: /^Majhna/ }));
    expect(query()).toBe("?spol=samec&velikost=majhna");
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
