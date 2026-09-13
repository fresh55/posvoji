// @vitest-environment jsdom

import { act, cleanup, render, screen, within } from "@testing-library/react";
import type { Animal } from "@posvoji/schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnimalFacts } from "@/components/animal-dialog/animal-facts";
import { I18nProvider } from "@/components/i18n-provider";
import {
  prefetchAnimalDescriptions,
  resetAnimalDescriptionsStore,
} from "@/lib/animal-descriptions";
import type { Locale } from "@/lib/i18n";

// The dialog fetches the shelter's text for an animal that arrived without
// one, so every render here has a file to read. Empty by default: a test that
// wants the fallback says so.
function serving(descriptions: Record<string, string> = {}) {
  const fetch = vi.fn(async () => ({
    ok: true,
    json: async () => descriptions,
  }));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

beforeEach(() => {
  serving();
});

afterEach(() => {
  cleanup();
  resetAnimalDescriptionsStore();
  vi.unstubAllGlobals();
});

const REFERENCE = new Date("2026-08-15T00:00:00Z");

function animal(extra: Partial<Animal> = {}): Animal {
  return {
    id: "a1",
    source: {
      providerId: "zavetisce",
      sourceUrl: "https://example.test/zival",
      fetchedAt: "2026-08-01T00:00:00Z",
      firstSeenAt: "2026-08-01T00:00:00Z",
      lastSeenAt: "2026-08-01T00:00:00Z",
    },
    shelter: { id: "s1", name: "Zavetišče", city: "Ljubljana" },
    name: "Muri",
    species: "cat",
    status: "available",
    images: [],
    attribution: "Vir: Zavetišče",
    ...extra,
  };
}

function renderFacts(extra: Partial<Animal> = {}, locale: Locale = "sl") {
  render(
    <I18nProvider locale={locale}>
      <AnimalFacts animal={animal(extra)} reference={REFERENCE} />
    </I18nProvider>,
  );
}

describe("the zdravje row", () => {
  // FIV and FeLV are cat viruses. A dog's record can carry a negative all the
  // same, a field filled in rather than a test run.
  it("keeps the FIV and FeLV badges off a dog", () => {
    renderFacts({
      species: "dog",
      medical: { fiv: "negative", felv: "negative" },
    });
    // Not folded behind the summary either: there is no health row at all.
    expect(screen.queryByRole("list", { name: "Zdravje" })).toBeNull();
  });

  it("draws them for a cat with the same record", () => {
    renderFacts({ medical: { fiv: "negative", felv: "negative" } });

    const row = screen.getByRole("list", { name: "Zdravje" });
    expect(within(row).getByText("Brez FIV")).toBeTruthy();
    expect(within(row).getByText("Brez FeLV")).toBeTruthy();
  });

  // The fold is measured against what the species could be asked, so a dog is
  // complete at three and folds the same way a cat does at five. No count
  // beside it: a dog's (3/3) read as a smaller record than a cat's (5/5).
  it("folds a dog's complete record at three", () => {
    renderFacts({
      species: "dog",
      medical: { neutered: true, vaccinated: true, microchipped: true },
    });

    expect(
      screen.getByRole("button", { name: /^Veterinarsko urejeno/ }),
    ).toBeTruthy();
    expect(screen.queryByText(/\(3\/3\)/)).toBeNull();
  });

  // The summary is replaced by the itemized row when pressed and never comes
  // back, so it is not a disclosure: an aria-expanded that could only ever say
  // "false" told a screen reader there was a section to collapse again.
  it("does not describe the summary as a collapsed section", () => {
    renderFacts({
      species: "dog",
      medical: { neutered: true, vaccinated: true, microchipped: true },
    });

    expect(
      screen
        .getByRole("button", { name: /Veterinarsko urejeno/ })
        .hasAttribute("aria-expanded"),
    ).toBe(false);
  });

  // An itemized row lists what the record answers, so a cat with three green
  // pills and no test results said nothing about the two questions a visitor
  // with a resident cat came for.
  it("names both missing tests on a partial cat record", () => {
    renderFacts({
      medical: { neutered: true, vaccinated: true, microchipped: true },
    });

    const row = screen.getByRole("list", { name: "Zdravje" });
    expect(within(row).getByText("Ni podatka o FIV in FeLV")).toBeTruthy();
  });

  it("names only the test that is missing", () => {
    renderFacts({ medical: { fiv: "unknown", felv: "negative" } });

    const row = screen.getByRole("list", { name: "Zdravje" });
    expect(within(row).getByText("Brez FeLV")).toBeTruthy();
    expect(within(row).getByText("Ni podatka o FIV")).toBeTruthy();
  });

  // Nothing to open on a test nobody ran: the pill states the gap and stays
  // inert, unlike the recorded results beside it.
  it("offers nothing to press on the missing test", () => {
    renderFacts({ medical: { fiv: "unknown", felv: "negative" } });

    const row = screen.getByRole("list", { name: "Zdravje" });
    const buttons = within(row).getAllByRole("button");
    expect(buttons).toHaveLength(1);
    expect(buttons[0].textContent).toContain("Brez FeLV");
  });

  // A result is a result. The shelter's own words carry a positive one, and a
  // pill saying the opposite of what they say would be worse than silence.
  it("says nothing about a recorded positive", () => {
    renderFacts({ medical: { fiv: "positive", felv: "negative" } });

    expect(screen.queryByText(/Ni podatka/)).toBeNull();
  });

  // A complete record has no gap, so the pill cannot be hiding behind the
  // summary either.
  it("keeps the gap off a complete cat record, folded or open", () => {
    renderFacts({
      medical: {
        neutered: true,
        vaccinated: true,
        microchipped: true,
        fiv: "negative",
        felv: "negative",
      },
    });

    expect(screen.queryByText(/Ni podatka/)).toBeNull();

    act(() => {
      screen.getByRole("button", { name: /Veterinarsko urejeno/ }).click();
    });

    expect(screen.queryByText(/Ni podatka/)).toBeNull();
  });

  it("leaves a dog's partial record alone, having never asked", () => {
    renderFacts({ species: "dog", medical: { neutered: true } });

    expect(screen.queryByText(/Ni podatka/)).toBeNull();
  });

  // A shelter that recorded nothing says nothing: there is no row to hang the
  // gap on.
  it("stays silent when the record is empty", () => {
    renderFacts({ medical: {} });

    expect(screen.queryByRole("list", { name: "Zdravje" })).toBeNull();
    expect(screen.queryByText(/Ni podatka/)).toBeNull();
  });
});

describe("the družba row", () => {
  it("says nothing at all when the shelter has answered nothing", () => {
    renderFacts({ sex: "female" });
    expect(screen.queryByRole("list", { name: "Družba" })).toBeNull();
  });

  it("stays away for an empty goodWith block too", () => {
    renderFacts({ goodWith: {} });
    expect(screen.queryByRole("list", { name: "Družba" })).toBeNull();
  });

  it("answers all three questions once one of them is known", () => {
    renderFacts({ goodWith: { kids: "yes" } });

    const row = screen.getByRole("list", { name: "Družba" });
    const items = within(row).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(within(row).getByText("Se razume z otroki")).toBeTruthy();
    expect(within(row).getByText("Ni podatka o psih")).toBeTruthy();
    expect(within(row).getByText("Ni podatka o mačkah")).toBeTruthy();
  });

  it("softens a no instead of marking the animal down", () => {
    renderFacts({ goodWith: { kids: "no", dogs: "unknown", cats: "yes" } });

    const row = screen.getByRole("list", { name: "Družba" });
    expect(within(row).getByText("Raje brez otrok")).toBeTruthy();
    expect(within(row).getByText("Ni podatka o psih")).toBeTruthy();
    expect(within(row).getByText("Se razume z mačkami")).toBeTruthy();
  });

  it("offers the shelter's reasoning only behind a yes", () => {
    renderFacts({ goodWith: { kids: "yes", dogs: "no" } });

    const row = screen.getByRole("list", { name: "Družba" });
    const buttons = within(row).getAllByRole("button");
    expect(buttons).toHaveLength(1);
    expect(buttons[0].textContent).toContain("Se razume z otroki");
  });

  it("names the animal in the popover sentence", async () => {
    renderFacts({ goodWith: { cats: "yes" } });

    const row = screen.getByRole("list", { name: "Družba" });
    within(row).getByRole("button").click();

    expect(
      await screen.findByText(
        "Zavetišče presoja, da se Muri razume z mačkami.",
      ),
    ).toBeTruthy();
  });
});

describe("the housing row", () => {
  it("stays away when the shelter has not answered", () => {
    renderFacts({ sex: "female" });
    expect(screen.queryByRole("list", { name: "Dom" })).toBeNull();
  });

  it("stays away for an unknown answer, which says nothing", () => {
    renderFacts({ apartmentOk: "unknown" });
    expect(screen.queryByRole("list", { name: "Dom" })).toBeNull();
  });

  it("shows a yes and explains it when asked", async () => {
    renderFacts({ apartmentOk: "yes" });

    const row = screen.getByRole("list", { name: "Dom" });
    const button = within(row).getByRole("button");
    expect(button.textContent).toContain("Primeren za stanovanje");

    button.click();
    expect(
      await screen.findByText(
        "Zavetišče presoja, da lahko Muri živi v stanovanju.",
      ),
    ).toBeTruthy();
  });

  it("states a no plainly, with nothing to open", () => {
    renderFacts({ apartmentOk: "no" });

    const row = screen.getByRole("list", { name: "Dom" });
    expect(
      within(row).getByText("Potrebuje več prostora kot stanovanje"),
    ).toBeTruthy();
    expect(within(row).queryByRole("button")).toBeNull();
  });
});

describe("the shelter's own description", () => {
  const DESCRIPTION = "Muri je prijazna muca, ki obožuje crkljanje.";

  // 466 of the 503 animals carry one, and it is the shelter's Slovenian
  // whichever language the visitor is reading in. Under <html lang="en"> a
  // screen reader voiced it with English phonemes.
  it("is marked Slovenian on an English page", () => {
    renderFacts({ shortDescription: DESCRIPTION }, "en");

    expect(screen.getByText(DESCRIPTION).getAttribute("lang")).toBe("sl");
  });

  it("says nothing about the language on a Slovenian page", () => {
    renderFacts({ shortDescription: DESCRIPTION });

    // The document already declares it, and repeating it here would be one
    // more attribute on 466 pages saying what the html element says.
    expect(screen.getByText(DESCRIPTION).getAttribute("lang")).toBeNull();
  });

  it("prints a short description whole", () => {
    renderFacts({ shortDescription: DESCRIPTION });

    expect(screen.getByText(DESCRIPTION).className).not.toContain(
      "line-clamp-5",
    );
    expect(screen.queryByRole("button", { name: "Preberi več" })).toBeNull();
  });

  it("clamps a long one", () => {
    const long = DESCRIPTION.repeat(8);
    renderFacts({ shortDescription: long });

    expect(screen.getByText(long).className).toContain("line-clamp-5");
    expect(screen.getByRole("button", { name: "Preberi več" })).toBeTruthy();
  });

  // The clamp is five lines, and the text is printed whitespace-pre-line, so
  // a listing set out a line at a time is over that long before it is over
  // the character count. It used to be measured by length alone and stood
  // there at full height.
  it("clamps a short one the shelter set out in lines", () => {
    const lines = "Muri\nMuca\n3 leta\nSamica\nCepljena\nSterilizirana";
    renderFacts({ shortDescription: lines });

    const paragraph = screen.getByText(/Sterilizirana/);
    expect(paragraph.className).toContain("line-clamp-5");
    expect(screen.getByRole("button", { name: "Preberi več" })).toBeTruthy();
  });

  it("leaves four lines alone", () => {
    const lines = "Muri\nMuca\n3 leta\nSamica";
    renderFacts({ shortDescription: lines });

    expect(screen.getByText(/Samica/).className).not.toContain("line-clamp-5");
    expect(screen.queryByRole("button", { name: "Preberi več" })).toBeNull();
  });

  // The button says nothing about what it opens on its own, and the sentence
  // it opens is not its own text.
  it("names the paragraph the read-more button expands", () => {
    const long = DESCRIPTION.repeat(8);
    renderFacts({ shortDescription: long });

    const button = screen.getByRole("button", { name: "Preberi več" });
    expect(button.getAttribute("aria-controls")).toBe(
      screen.getByText(long).id,
    );
    expect(screen.getByText(long).id).not.toBe("");
  });

  // The animal's own page is server-rendered from a whole dataset animal, so
  // the text is already in the markup and there is nothing to go and get.
  it("prints the animal's own description without fetching", () => {
    const fetch = serving({ a1: "Kar je prišlo iz datoteke." });

    renderFacts({ shortDescription: DESCRIPTION });

    expect(screen.getByText(DESCRIPTION)).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();
  });

  // The grid's dialog, where the home page no longer ships 503 descriptions
  // to print at most one. See lib/animal-descriptions.ts.
  it("fetches the text for an animal that arrived without one", async () => {
    serving({ a1: DESCRIPTION });

    renderFacts();

    expect(screen.queryByText(DESCRIPTION)).toBeNull();
    expect(await screen.findByText(DESCRIPTION)).toBeTruthy();
  });

  it("draws no paragraph when neither the animal nor the file has one", async () => {
    serving({ a2: DESCRIPTION });

    renderFacts();
    // Awaited, so this is the answer after the file landed and not the same
    // nothing the render started with.
    await act(async () => {
      await prefetchAnimalDescriptions();
    });

    expect(screen.queryByText(DESCRIPTION)).toBeNull();
    expect(screen.queryByRole("button", { name: "Preberi več" })).toBeNull();
  });

  // The clamp measures whatever is on screen, wherever it came from.
  it("clamps a long fetched description the same as an inline one", async () => {
    const long = "Zelo prijazna muca. ".repeat(20).trim();
    serving({ a1: long });

    renderFacts();

    const paragraph = await screen.findByText(/Zelo prijazna muca/);
    expect(paragraph.className).toContain("line-clamp-5");
    expect(screen.getByRole("button", { name: "Preberi več" })).toBeTruthy();
  });
});

describe("the special care pill", () => {
  it("says nothing unless the shelter marked the animal", () => {
    renderFacts({ specialNeeds: false });
    expect(
      screen.queryByRole("list", { name: "Pogoji posvojitve" }),
    ).toBeNull();
    expect(
      screen.queryByText("Potrebuje potrpežljivega človeka"),
    ).toBeNull();
  });

  // A pill carries a label, not a sentence, and the words are the care
  // filter's own: a visitor who ticked that filter should read the same thing
  // here.
  it("asks for the right person in the words the filter uses", () => {
    renderFacts({ specialNeeds: true });

    const conditions = screen.getByRole("list", {
      name: "Pogoji posvojitve",
    });
    expect(
      within(conditions).getByText("Potrebuje potrpežljivega človeka"),
    ).toBeTruthy();
    expect(
      screen.queryByText(
        "Ta žival potrebuje potrpežljivega človeka in nekaj več časa.",
      ),
    ).toBeNull();
  });

  // One row for both. Separately they asked the visitor the same question,
  // what the home has to be, twice.
  it("shares the row with the reviewed requirements", () => {
    renderFacts({
      specialNeeds: true,
      adoptionRequirements: { indoorOnly: true },
    });

    const conditions = screen.getByRole("list", {
      name: "Pogoji posvojitve",
    });
    expect(within(conditions).getAllByRole("listitem")).toHaveLength(2);
  });
});

describe("reviewed adoption requirements", () => {
  // Its own name. The housing row is already called "Home", and two lists
  // under one name are two landmarks a screen reader cannot tell apart.
  it("omits the requirement list when none are confirmed", () => {
    renderFacts({ adoptionRequirements: { indoorOnly: false } }, "en");
    expect(
      screen.queryByRole("list", { name: "Adoption conditions" }),
    ).toBeNull();
  });

  it("names the requirement list apart from the housing row", () => {
    renderFacts(
      { apartmentOk: "no", adoptionRequirements: { indoorOnly: true } },
      "en",
    );

    const housing = screen.getByRole("list", { name: "Home" });
    const conditions = screen.getByRole("list", {
      name: "Adoption conditions",
    });
    expect(within(conditions).getByText("Indoor-only home")).toBeTruthy();
    // Indoor-only and "needs more room than an apartment" are different
    // answers, so they stay in different rows; see docs/ANIMAL-ENRICHMENT.md.
    expect(
      within(housing).getByText("Needs more room than an apartment"),
    ).toBeTruthy();
    expect(
      within(conditions).queryByText("Needs more room than an apartment"),
    ).toBeNull();
  });

  it("shows confirmed requirements in the animal facts", () => {
    renderFacts({ adoptionRequirements: {
      indoorOnly: true, bondedPair: true, experiencedCarer: true, ongoingCare: true,
    } }, "en");
    for (const label of ["Indoor-only home", "Adopt together", "Experienced carer", "Ongoing care"]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });

  it("does not present false or absent requirements as confirmed", () => {
    renderFacts({ adoptionRequirements: { indoorOnly: false, bondedPair: true } }, "en");
    expect(screen.getByText("Adopt together")).toBeTruthy();
    for (const label of ["Indoor-only home", "Experienced carer", "Ongoing care"]) {
      expect(screen.queryByText(label)).toBeNull();
    }
  });

  // A requirement that rules a home out was the last thing on the screen, in
  // 12px muted text under a paragraph that opens clamped. It now sits in the
  // badge group, second, behind only who the animal is.
  it("stands in the badge group above the health row and the description", () => {
    const description = "Oddaja se izključno za notranje bivanje.";
    renderFacts(
      {
        sex: "female",
        adoptionRequirements: { indoorOnly: true },
        medical: { neutered: true },
        shortDescription: description,
      },
      "en",
    );

    const identity = screen.getByRole("list", { name: "Animal details" });
    const conditions = screen.getByRole("list", {
      name: "Adoption conditions",
    });
    expect(conditions.parentElement).toBe(identity.parentElement);
    for (const later of [
      screen.getByRole("list", { name: "Health" }),
      screen.getByText(description),
    ]) {
      expect(
        conditions.compareDocumentPosition(later) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
  });

  // The dress is the point: a condition reads as a condition only if it is
  // not muted context. No fill, a darker edge than the "no" answers, and the
  // foreground ink the identity pills have.
  it("dresses a condition as its own tier of pill", () => {
    renderFacts({ adoptionRequirements: { indoorOnly: true } }, "en");

    const pill = within(
      screen.getByRole("list", { name: "Adoption conditions" }),
    ).getByRole("listitem");
    expect(pill.className).toContain("border-foreground/25");
    expect(pill.className).not.toContain("text-muted-foreground");
  });

  // The shelter's own words often say it again at the end of the paragraph.
  // That is not a reason to drop the pill: the paragraph opens clamped.
  it("keeps the pill when the description says the same thing", () => {
    const description = "Oddaja se izključno za notranje bivanje.";
    renderFacts(
      { adoptionRequirements: { indoorOnly: true }, shortDescription: description },
      "en",
    );

    expect(
      within(
        screen.getByRole("list", { name: "Adoption conditions" }),
      ).getByText("Indoor-only home"),
    ).toBeTruthy();
    expect(screen.getByText(description)).toBeTruthy();
  });
});
