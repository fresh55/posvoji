import { describe, expect, it } from "vitest";
import type { Animal, Species, TestResult } from "@posvoji/schema";
import {
  activeFilterCount,
  applyFilters,
  bySpecies,
  careCounts,
  EMPTY_FILTERS,
  facetCounts,
  goodWithCounts,
  homeCounts,
  parseFilters,
  pruneHiddenFilters,
  serializeFilters,
  toggleCounts,
  toggleValues,
  visibleCare,
  visibleGoodWith,
  visibleGroups,
  visibleHome,
  visibleToggles,
  type Filters,
  type SpeciesFilter,
} from "./filters";

const NOW = new Date("2026-08-15T00:00:00Z");

let seq = 0;

function animal(species: Species, extra: Partial<Animal> = {}): Animal {
  seq += 1;
  return {
    id: `a${seq}`,
    source: {
      providerId: "zavetisce",
      sourceUrl: "https://example.org/zival",
      fetchedAt: "2026-08-01T00:00:00Z",
      firstSeenAt: "2026-08-01T00:00:00Z",
      lastSeenAt: "2026-08-01T00:00:00Z",
    },
    shelter: { id: "s1", name: "Zavetišče", city: "Ljubljana" },
    species,
    status: "available",
    images: [],
    attribution: "Vir: Zavetišče",
    ...extra,
  };
}

function toggleKeys(animals: Animal[], species: SpeciesFilter): string[] {
  return visibleToggles(animals, species).map((toggle) => toggle.key);
}

describe("visibleGroups", () => {
  it("hides velikost on the cat tab even when the cats differ in size", () => {
    const cats = [
      animal("cat", { size: "small" }),
      animal("cat", { size: "large" }),
    ];
    expect(visibleGroups(cats, "cat", NOW).size).toBe(false);
  });

  it("keeps velikost on the dog tab", () => {
    const dogs = [
      animal("dog", { size: "small" }),
      animal("dog", { size: "large" }),
    ];
    expect(visibleGroups(dogs, "dog", NOW).size).toBe(true);
  });

  it("measures against the species tab, not the whole dataset", () => {
    const animals = [
      animal("dog", { sex: "male" }),
      animal("dog", { sex: "female" }),
      animal("cat", { sex: "female" }),
    ];
    expect(visibleGroups(bySpecies(animals, "all"), "all", NOW).sex).toBe(true);
    expect(visibleGroups(bySpecies(animals, "cat"), "cat", NOW).sex).toBe(false);
  });

  it("hides energija with fewer than two distinct values in the pool", () => {
    expect(visibleGroups([animal("dog")], "all", NOW).energy).toBe(false);

    const oneValue = [
      animal("dog", { energy: "calm" }),
      animal("dog", { energy: "calm" }),
    ];
    expect(visibleGroups(oneValue, "all", NOW).energy).toBe(false);
  });

  it("shows energija once the pool has two distinct values", () => {
    const animals = [
      animal("dog", { energy: "calm" }),
      animal("dog", { energy: "lively" }),
    ];
    expect(visibleGroups(animals, "all", NOW).energy).toBe(true);
  });

  it("keeps energija on the cat tab, unlike velikost", () => {
    const cats = [
      animal("cat", { energy: "calm" }),
      animal("cat", { energy: "lively" }),
    ];
    expect(visibleGroups(cats, "cat", NOW).energy).toBe(true);
  });
});

describe("visibleToggles", () => {
  const cats = [
    animal("cat", { medical: { fiv: "negative", felv: "negative" } }),
    animal("cat", { medical: { fiv: "positive", felv: "unknown" } }),
  ];

  it("offers FIV and FeLV on the cat tab", () => {
    expect(toggleKeys(cats, "cat")).toEqual(["brez-fiv", "brez-felv"]);
  });

  it("withholds them from every other tab, Vse included", () => {
    expect(toggleKeys(cats, "all")).toEqual([]);
    expect(toggleKeys(cats, "dog")).toEqual([]);
    expect(toggleKeys(cats, "rabbit")).toEqual([]);
  });

  it("takes only a recorded negative, never an untested cat", () => {
    const toggle = visibleToggles(cats, "cat").find((t) => t.key === "brez-fiv");
    const matches = (fiv?: TestResult) =>
      toggle?.matches(animal("cat", { medical: { fiv } }));
    expect(matches("negative")).toBe(true);
    expect(matches("positive")).toBe(false);
    expect(matches("unknown")).toBe(false);
    expect(matches(undefined)).toBe(false);
  });
});

describe("visibleGoodWith", () => {
  it("offers a facet only once it can narrow the list", () => {
    const animals = [
      animal("dog", { goodWith: { kids: "yes", dogs: "yes" } }),
      animal("dog", { goodWith: { kids: "no", dogs: "yes" } }),
    ];
    // Every animal is good with dogs, so that facet would change nothing.
    expect(visibleGoodWith(animals)).toEqual(["kids"]);
  });

  it("stays away while nothing has been answered", () => {
    expect(visibleGoodWith([animal("dog"), animal("cat")])).toEqual([]);
  });

  it("asks the same three questions of dogs and cats alike", () => {
    const animals = [
      animal("cat", { goodWith: { cats: "yes" } }),
      animal("dog", { goodWith: { cats: "no" } }),
    ];
    expect(visibleGoodWith(animals)).toEqual(["cats"]);
  });
});

describe("visibleHome", () => {
  it("offers the section only once it can narrow the list", () => {
    const animals = [
      animal("cat", { apartmentOk: "yes" }),
      animal("cat", { apartmentOk: "no" }),
    ];
    expect(visibleHome(animals)).toEqual(["apartment"]);
  });

  it("stays away while nothing has been answered", () => {
    expect(visibleHome([animal("dog"), animal("cat")])).toEqual([]);
  });

  it("stays away when every animal would pass it", () => {
    const animals = [
      animal("cat", { apartmentOk: "yes" }),
      animal("cat", { apartmentOk: "yes" }),
    ];
    expect(visibleHome(animals)).toEqual([]);
  });

  it("asks the same question of dogs and cats alike", () => {
    const animals = [
      animal("dog", { apartmentOk: "yes" }),
      animal("cat", { apartmentOk: "unknown" }),
    ];
    expect(visibleHome(animals)).toEqual(["apartment"]);
  });
});

describe("visibleCare", () => {
  it("offers the section only once it can narrow the list", () => {
    const animals = [
      animal("dog", { specialNeeds: true }),
      animal("dog", { specialNeeds: false }),
    ];
    expect(visibleCare(animals)).toEqual(["patient"]);
  });

  it("stays away while no shelter has marked anyone", () => {
    expect(visibleCare([animal("dog"), animal("cat")])).toEqual([]);
  });

  it("stays away when every animal would pass it", () => {
    const animals = [
      animal("dog", { specialNeeds: true }),
      animal("cat", { specialNeeds: true }),
    ];
    expect(visibleCare(animals)).toEqual([]);
  });
});

describe("pruneHiddenFilters", () => {
  it("keeps every selected age visible instead of silently clearing it", () => {
    const pruned = pruneHiddenFilters({
      ...EMPTY_FILTERS,
      age: ["mladicek", "odrasel", "senior"],
    });

    expect(pruned.age).toEqual(["mladicek", "odrasel", "senior"]);
  });

  it("keeps a meaningful two-age selection", () => {
    const pruned = pruneHiddenFilters({
      ...EMPTY_FILTERS,
      age: ["mladicek", "senior"],
    });

    expect(pruned.age).toEqual(["mladicek", "senior"]);
  });

  it("drops velikost once the tab turns to cats", () => {
    const pruned = pruneHiddenFilters({
      ...EMPTY_FILTERS,
      species: "cat",
      sex: ["female"],
      size: ["small", "large"],
    });
    expect(pruned.size).toEqual([]);
    expect(pruned.sex).toEqual(["female"]);
  });

  it("drops the cat-only toggles once the tab turns to dogs", () => {
    const pruned = pruneHiddenFilters({
      ...EMPTY_FILTERS,
      species: "dog",
      toggles: ["cepljenje", "brez-fiv", "brez-felv"],
    });
    expect(pruned.toggles).toEqual(["cepljenje"]);
  });

  it("keeps the družba selection across a species change", () => {
    const pruned = pruneHiddenFilters({
      ...EMPTY_FILTERS,
      species: "dog",
      goodWith: ["kids", "cats"],
    });
    expect(pruned.goodWith).toEqual(["kids", "cats"]);
  });

  it("keeps the dom and skrb selections across a species change", () => {
    const pruned = pruneHiddenFilters({
      ...EMPTY_FILTERS,
      species: "cat",
      home: ["apartment"],
      care: ["patient"],
    });
    expect(pruned.home).toEqual(["apartment"]);
    expect(pruned.care).toEqual(["patient"]);
  });

  it("leaves the cat tab holding its own toggles", () => {
    const pruned = pruneHiddenFilters({
      ...EMPTY_FILTERS,
      species: "cat",
      toggles: ["brez-fiv"],
    });
    expect(pruned.toggles).toEqual(["brez-fiv"]);
  });

  it("keeps an energija selection across a switch to the cat tab", () => {
    const pruned = pruneHiddenFilters({
      ...EMPTY_FILTERS,
      species: "cat",
      energy: ["calm", "lively"],
    });
    expect(pruned.energy).toEqual(["calm", "lively"]);
  });
});

describe("URL codec", () => {
  it("round-trips an explicit all-age selection", () => {
    const filters = parseFilters("starost=mladicek,odrasel,senior");

    expect(filters.age).toEqual(["mladicek", "odrasel", "senior"]);
    expect(activeFilterCount(filters)).toBe(3);
    expect(serializeFilters(filters)).toBe(
      "starost=mladicek,odrasel,senior",
    );
  });

  it("round-trips the cat-only toggles", () => {
    const filters: Filters = {
      ...EMPTY_FILTERS,
      species: "cat",
      toggles: ["brez-fiv", "brez-felv"],
    };
    const query = serializeFilters(filters);
    expect(query).toBe("vrsta=macka&lastnosti=brez-fiv,brez-felv");
    expect(parseFilters(query)).toEqual(filters);
  });

  it("round-trips the družba selection under its own param", () => {
    const filters: Filters = {
      ...EMPTY_FILTERS,
      goodWith: ["kids", "dogs", "cats"],
    };
    const query = serializeFilters(filters);
    expect(query).toBe("druzba=otroci,psi,macke");
    expect(parseFilters(query)).toEqual(filters);
  });

  it("drops an unknown družba slug rather than breaking the link", () => {
    const filters = parseFilters("druzba=otroci,ptice");
    expect(filters.goodWith).toEqual(["kids"]);
    expect(activeFilterCount(filters)).toBe(1);
    expect(serializeFilters(filters)).toBe("druzba=otroci");
  });

  it("round-trips the dom and skrb selections under their own params", () => {
    const filters: Filters = {
      ...EMPTY_FILTERS,
      home: ["apartment"],
      care: ["patient"],
    };
    const query = serializeFilters(filters);
    expect(query).toBe("dom=stanovanje&skrb=potrpezljiv");
    expect(parseFilters(query)).toEqual(filters);
    expect(activeFilterCount(filters)).toBe(2);
  });

  it("drops an unknown dom or skrb slug rather than breaking the link", () => {
    const filters = parseFilters("dom=hisa&skrb=potrpezljiv,nujno");
    expect(filters.home).toEqual([]);
    expect(filters.care).toEqual(["patient"]);
    expect(serializeFilters(filters)).toBe("skrb=potrpezljiv");
  });

  it("keeps a repeated dom slug to one selection", () => {
    expect(parseFilters("dom=stanovanje,stanovanje").home).toEqual([
      "apartment",
    ]);
  });

  it("degrades a stale cat-only toggle carried onto the dog tab", () => {
    const filters = parseFilters(
      "vrsta=pes&velikost=majhna&lastnosti=cip,brez-fiv",
    );
    expect(filters.toggles).toEqual(["cip"]);
    expect(activeFilterCount(filters)).toBe(2);
    expect(serializeFilters(filters)).toBe(
      "vrsta=pes&velikost=majhna&lastnosti=cip",
    );
  });

  it("degrades a stale velikost carried onto the cat tab", () => {
    const filters = parseFilters("vrsta=macka&velikost=majhna&spol=samica");
    expect(filters.size).toEqual([]);
    expect(activeFilterCount(filters)).toBe(1);
    expect(serializeFilters(filters)).toBe("vrsta=macka&spol=samica");
  });

  it("round-trips an energija selection under its own param", () => {
    const filters: Filters = {
      ...EMPTY_FILTERS,
      energy: ["calm", "lively"],
    };
    const query = serializeFilters(filters);
    expect(query).toBe("energija=miren,zivahen");
    expect(parseFilters(query)).toEqual(filters);
  });

  it("drops an unknown energija slug rather than breaking the link", () => {
    const filters = parseFilters("energija=hiper");
    expect(filters.energy).toEqual([]);
    expect(activeFilterCount(filters)).toBe(0);
    expect(serializeFilters(filters)).toBe("");
  });

  it("drops an empty zavetisce value rather than filtering on nothing", () => {
    // Shelter slugs are ids the codec cannot check against a dataset, so they
    // pass through. An empty one used to pass through too, and no animal has
    // it: the page went to nothing matching, behind a chip with no words on it.
    expect(parseFilters("zavetisce=,").shelter).toEqual([]);
    expect(parseFilters("zavetisce=ljubljana,,horjul").shelter).toEqual([
      "ljubljana",
      "horjul",
    ]);
    expect(parseFilters("zavetisce=%20").shelter).toEqual([]);
  });

  it("caps how many values one param can carry", () => {
    const many = Array.from({ length: 500 }, (_, i) => `s${i}`).join(",");
    // Every value that survives costs a chip and a full pass over the dataset
    // to price it, so the link cannot be allowed to name as many as it likes.
    expect(parseFilters(`zavetisce=${many}`).shelter).toHaveLength(32);
  });

  it("drops a value too long to be a slug anyone wrote", () => {
    const long = "x".repeat(65);
    expect(parseFilters(`zavetisce=ljubljana,${long}`).shelter).toEqual([
      "ljubljana",
    ]);
  });

  it("reads a param the link repeats as the one list it means", () => {
    // This codec writes one param carrying a comma list, but a URL is free to
    // repeat the param instead and hand-built links do. get() returned the
    // first only, so half the selection went missing without a sign.
    expect(parseFilters("spol=samec&spol=samica").sex).toEqual([
      "male",
      "female",
    ]);
    expect(parseFilters("starost=mladicek&starost=senior,odrasel").age).toEqual([
      "mladicek",
      "senior",
      "odrasel",
    ]);
    expect(parseFilters("zavetisce=horjul&zavetisce=horjul").shelter).toEqual([
      "horjul",
    ]);
  });

  it("keeps one copy of a value the link repeats", () => {
    expect(parseFilters("zavetisce=horjul,horjul,horjul").shelter).toEqual([
      "horjul",
    ]);
    expect(parseFilters("lastnosti=cip,cip").toggles).toEqual(["cip"]);
  });
});

describe("active filter count", () => {
  it("counts every selected value, not the axes they sit on", () => {
    expect(
      activeFilterCount({
        ...EMPTY_FILTERS,
        species: "cat",
        sex: ["male", "female"],
        age: ["mladicek", "odrasel", "senior"],
        shelter: ["s1", "s2"],
        toggles: ["cepljenje", "sterilizacija"],
      }),
    ).toBe(9);
  });

  it("counts družba, dom and skrb values too", () => {
    expect(
      activeFilterCount({
        ...EMPTY_FILTERS,
        goodWith: ["kids", "dogs"],
        home: ["apartment"],
        care: ["patient"],
      }),
    ).toBe(4);
  });

  it("does not count the species tab", () => {
    expect(activeFilterCount({ ...EMPTY_FILTERS, species: "dog" })).toBe(0);
  });
});

describe("multi-select behavior", () => {
  it("uses OR for choices within sex", () => {
    const male = animal("dog", { sex: "male" });
    const female = animal("dog", { sex: "female" });
    const unknown = animal("dog", { sex: "unknown" });

    expect(
      applyFilters(
        [male, female, unknown],
        { ...EMPTY_FILTERS, sex: ["male", "female"] },
        NOW,
      ),
    ).toEqual([male, female]);
  });

  it("uses OR for choices within age and keeps all three selected", () => {
    const young = animal("dog", { approximateAgeMonths: 6 });
    const adult = animal("dog", { approximateAgeMonths: 36 });
    const senior = animal("dog", { approximateAgeMonths: 120 });
    const unknown = animal("dog");

    expect(
      applyFilters(
        [young, adult, senior, unknown],
        {
          ...EMPTY_FILTERS,
          age: ["mladicek", "odrasel", "senior"],
        },
        NOW,
      ),
    ).toEqual([young, adult, senior]);
  });

  it("uses OR for choices within health", () => {
    const vaccinated = animal("dog", { medical: { vaccinated: true } });
    const neutered = animal("dog", { medical: { neutered: true } });
    const both = animal("dog", {
      medical: { vaccinated: true, neutered: true },
    });
    const neither = animal("dog");

    expect(
      applyFilters(
        [vaccinated, neutered, both, neither],
        {
          ...EMPTY_FILTERS,
          toggles: ["cepljenje", "sterilizacija"],
        },
        NOW,
      ),
    ).toEqual([vaccinated, neutered, both]);
  });

  it("keeps only a recorded yes within družba", () => {
    const yes = animal("dog", { goodWith: { kids: "yes" } });
    const maybe = animal("dog", { goodWith: { kids: "unknown" } });
    const no = animal("dog", { goodWith: { kids: "no" } });
    const silent = animal("dog");

    expect(
      applyFilters(
        [yes, maybe, no, silent],
        { ...EMPTY_FILTERS, goodWith: ["kids"] },
        NOW,
      ),
    ).toEqual([yes]);
  });

  // A household with a child and a dog needs both answered, so this section
  // narrows where the others widen.
  it("uses AND for choices within družba, unlike every other section", () => {
    const both = animal("dog", { goodWith: { kids: "yes", cats: "yes" } });
    const kidsOnly = animal("dog", { goodWith: { kids: "yes", cats: "no" } });
    const catsOnly = animal("dog", { goodWith: { cats: "yes" } });

    expect(
      applyFilters(
        [both, kidsOnly, catsOnly],
        { ...EMPTY_FILTERS, goodWith: ["kids", "cats"] },
        NOW,
      ),
    ).toEqual([both]);
  });

  it("counts each družba choice as what picking it would leave", () => {
    const kids = animal("dog", { goodWith: { kids: "yes" } });
    const cats = animal("dog", { goodWith: { cats: "yes" } });
    const counts = goodWithCounts([kids, cats], EMPTY_FILTERS, NOW);

    expect(counts.get("kids")).toBe(1);
    expect(counts.get("cats")).toBe(1);
    expect(counts.get("dogs")).toBe(0);
  });

  // With kids already on, "Mačke" promises what both facets leave, not what
  // mačke alone would find.
  it("measures a družba choice on top of the ones already selected", () => {
    const both = animal("dog", { goodWith: { kids: "yes", cats: "yes" } });
    const kidsOnly = animal("dog", { goodWith: { kids: "yes" } });
    const catsOnly = animal("dog", { goodWith: { cats: "yes" } });
    const counts = goodWithCounts(
      [both, kidsOnly, catsOnly],
      { ...EMPTY_FILTERS, goodWith: ["kids"] },
      NOW,
    );

    expect(counts.get("cats")).toBe(1);
    // Its own count drops off the selection, so unchecking is still priced.
    expect(counts.get("kids")).toBe(2);
  });

  it("still narrows the družba tally by the other sections", () => {
    const dog = animal("dog", { goodWith: { kids: "yes" } });
    const cat = animal("cat", { goodWith: { kids: "yes" } });
    const counts = goodWithCounts(
      [dog, cat],
      { ...EMPTY_FILTERS, species: "cat" },
      NOW,
    );

    expect(counts.get("kids")).toBe(1);
  });

  it("keeps only a recorded yes within dom", () => {
    const yes = animal("cat", { apartmentOk: "yes" });
    const maybe = animal("cat", { apartmentOk: "unknown" });
    const no = animal("cat", { apartmentOk: "no" });
    const silent = animal("cat");

    expect(
      applyFilters(
        [yes, maybe, no, silent],
        { ...EMPTY_FILTERS, home: ["apartment"] },
        NOW,
      ),
    ).toEqual([yes]);
  });

  it("keeps only an animal the shelter marked within skrb", () => {
    const marked = animal("dog", { specialNeeds: true });
    const notMarked = animal("dog", { specialNeeds: false });
    const silent = animal("dog");

    expect(
      applyFilters(
        [marked, notMarked, silent],
        { ...EMPTY_FILTERS, care: ["patient"] },
        NOW,
      ),
    ).toEqual([marked]);
  });

  it("ANDs dom and skrb with each other and with the other sections", () => {
    const both = animal("cat", { apartmentOk: "yes", specialNeeds: true });
    const homeOnly = animal("cat", { apartmentOk: "yes" });
    const careOnly = animal("cat", { specialNeeds: true });
    const otherSpecies = animal("dog", {
      apartmentOk: "yes",
      specialNeeds: true,
    });

    expect(
      applyFilters(
        [both, homeOnly, careOnly, otherSpecies],
        {
          ...EMPTY_FILTERS,
          species: "cat",
          home: ["apartment"],
          care: ["patient"],
        },
        NOW,
      ),
    ).toEqual([both]);
  });

  it("counts dom as what picking it would leave, its own axis dropped", () => {
    const apartment = animal("cat", { apartmentOk: "yes" });
    const house = animal("cat", { apartmentOk: "no" });
    const counts = homeCounts(
      [apartment, house],
      { ...EMPTY_FILTERS, home: ["apartment"] },
      NOW,
    );

    expect(counts.get("apartment")).toBe(1);
  });

  it("still narrows the dom tally by the other sections", () => {
    const cat = animal("cat", { apartmentOk: "yes" });
    const dog = animal("dog", { apartmentOk: "yes" });
    const counts = homeCounts(
      [cat, dog],
      { ...EMPTY_FILTERS, species: "cat" },
      NOW,
    );

    expect(counts.get("apartment")).toBe(1);
  });

  it("prices skrb on top of a dom already selected", () => {
    const both = animal("cat", { apartmentOk: "yes", specialNeeds: true });
    const homeOnly = animal("cat", { apartmentOk: "yes" });
    const careOnly = animal("cat", { specialNeeds: true });
    const counts = careCounts(
      [both, homeOnly, careOnly],
      { ...EMPTY_FILTERS, home: ["apartment"] },
      NOW,
    );

    expect(counts.get("patient")).toBe(1);
  });

  it("counts each health choice independently of selected health choices", () => {
    const vaccinated = animal("dog", { medical: { vaccinated: true } });
    const neutered = animal("dog", { medical: { neutered: true } });
    const counts = toggleCounts(
      [vaccinated, neutered],
      { ...EMPTY_FILTERS, toggles: ["cepljenje"] },
      NOW,
    );

    expect(counts.get("cepljenje")).toBe(1);
    expect(counts.get("sterilizacija")).toBe(1);
  });

  it("uses OR for choices within energija and leaves field-less animals out once selected", () => {
    const calm = animal("dog", { energy: "calm" });
    const lively = animal("dog", { energy: "lively" });
    const noAnswer = animal("dog");

    expect(
      applyFilters([calm, lively, noAnswer], EMPTY_FILTERS, NOW),
    ).toEqual([calm, lively, noAnswer]);

    expect(
      applyFilters(
        [calm, lively, noAnswer],
        { ...EMPTY_FILTERS, energy: ["calm"] },
        NOW,
      ),
    ).toEqual([calm]);
  });

  it("skips itself when counting energija, so a selected value still counts the rest", () => {
    const calm = animal("dog", { energy: "calm" });
    const lively = animal("dog", { energy: "lively" });
    const counts = facetCounts(
      [calm, lively],
      { ...EMPTY_FILTERS, energy: ["calm"] },
      NOW,
    );

    expect(counts.energy.get("calm")).toBe(1);
    expect(counts.energy.get("lively")).toBe(1);
  });
});

describe("selecting a whole region", () => {
  it("turns on every shelter in it in one go", () => {
    expect(toggleValues([], ["mh", "sia-in-lu", "muri"])).toEqual([
      "mh",
      "sia-in-lu",
      "muri",
    ]);
  });

  it("turns them all off again when they are all on", () => {
    expect(toggleValues(["mh", "sia-in-lu", "muri"], ["mh", "sia-in-lu", "muri"]))
      .toEqual([]);
  });

  it("completes a partly selected region rather than clearing it", () => {
    expect(toggleValues(["muri"], ["mh", "sia-in-lu", "muri"])).toEqual([
      "muri",
      "mh",
      "sia-in-lu",
    ]);
  });

  it("leaves shelters outside the region alone", () => {
    expect(toggleValues(["maribor", "mh"], ["mh"])).toEqual(["maribor"]);
    expect(toggleValues(["maribor"], ["mh", "muri"])).toEqual([
      "maribor",
      "mh",
      "muri",
    ]);
  });

  it("never doubles a shelter that was already on", () => {
    expect(toggleValues(["mh"], ["mh", "muri"])).toEqual(["mh", "muri"]);
  });
});
