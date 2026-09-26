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
function serving(descriptions: Record<string, { description: string }> = {}) {
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

// The block the shelter's paragraphs are printed in. It is the block and not
// the paragraphs that carries the clamp, the language and the id the read-more
// button points at, because the clamp counts lines across all of them.
function descriptionBlock(): HTMLElement | null {
  return document.querySelector("[data-slot='animal-description']");
}

describe("reviewed appearance and only-pet facts", () => {
  it.each([
    ["sl", "Črna, Bela", "Dolga", "Mora biti edina žival pri hiši"],
    ["en", "Black, White", "Long", "Needs to be the only pet"],
  ] as const)("keeps detailed colours alongside a single filter category in %s", (locale, colors, length, home) => {
    renderFacts({ coatColor: "black", coatColors: ["black", "white"], coatLength: "long", adoptionRequirements: { onlyPet: true } }, locale);
    expect(screen.getByText(colors)).toBeTruthy();
    expect(screen.getByText(length)).toBeTruthy();
    expect(screen.getByText(home)).toBeTruthy();
  });
});

describe("recorded energy", () => {
  it.each([
    ["calm", "sl", "Miren"],
    ["balanced", "sl", "Uravnotežen"],
    ["lively", "sl", "Živahen"],
    ["calm", "en", "Calm"],
    ["balanced", "en", "Balanced"],
    ["lively", "en", "Lively"],
  ] as const)("shows %s energy in %s even without other identity facts", (energy, locale, label) => {
    renderFacts({ energy }, locale);
    const row = screen.getByRole("list", {
      name: locale === "sl" ? "Podrobnosti o živali" : "Animal details",
    });
    expect(within(row).getByText(label)).toBeTruthy();
    expect(within(row).getAllByRole("listitem")).toHaveLength(1);
  });

  it("does not infer energy from the shelter's description", () => {
    renderFacts({ shortDescription: "Miren maček išče dom." });
    expect(screen.queryByRole("list", { name: "Podrobnosti o živali" })).toBeNull();
  });
});

describe("a stated life stage", () => {
  it.each([
    ["young", "sl", "Mladiček"],
    ["adult", "sl", "Odrasel"],
    ["senior", "en", "Senior"],
  ] as const)("names %s in %s where the shelter gave no age", (lifeStage, locale, label) => {
    renderFacts({ lifeStage }, locale);
    const row = screen.getByRole("list", {
      name: locale === "sl" ? "Podrobnosti o živali" : "Animal details",
    });
    expect(within(row).getByText(label)).toBeTruthy();
    expect(within(row).getAllByRole("listitem")).toHaveLength(1);
  });

  it("gives way to a stated age", () => {
    renderFacts({ lifeStage: "senior", approximateAgeMonths: 30 });
    const row = screen.getByRole("list", { name: "Podrobnosti o živali" });
    expect(within(row).queryByText("Senior")).toBeNull();
    expect(within(row).getAllByRole("listitem")).toHaveLength(1);
  });
});

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

  // Which of them can be pressed was a pointer's cursor and nothing else, so a
  // thumb had no way to tell. The dotted underline is the mark, and it is on
  // the labels that open an explainer and on no others.
  it("underlines the pills that explain themselves and nothing else", () => {
    renderFacts({
      medical: { fiv: "unknown", felv: "negative" },
      adoptionRequirements: { indoorOnly: true },
    });

    const row = screen.getByRole("list", { name: "Zdravje" });
    expect(within(row).getByText("Brez FeLV").className).toContain(
      "decoration-dotted",
    );
    // The gap pill opens nothing, and neither does a condition.
    expect(within(row).getByText("Ni podatka o FIV").className).not.toContain(
      "decoration-dotted",
    );
    const conditions = screen.getByRole("list", { name: "Pogoji posvojitve" });
    expect(within(conditions).getByRole("listitem").innerHTML).not.toContain(
      "decoration-dotted",
    );
  });

  // 26px of pill is a mouse's size. A thumb gets 36px of drawing and, where
  // the pill opens an explainer, 44px of hit area over it; the row's own gap
  // grows with that overlay so two wrapped lines cannot overlap each other's.
  it("stands the pills at a finger's size on a coarse pointer", () => {
    renderFacts({
      sex: "female",
      medical: { fiv: "unknown", felv: "negative" },
      adoptionRequirements: { indoorOnly: true },
    });

    const health = screen.getByRole("list", { name: "Zdravje" });
    expect(health.className).toContain("pointer-coarse:gap-y-2.5");
    const trigger = within(health).getByRole("button", { name: /Brez FeLV/ });
    expect(trigger.className).toContain("pointer-coarse:min-h-9");
    expect(trigger.className).toContain("pointer-coarse:tap-target");
    // The inert pills grow with them, so no row stands taller than its
    // neighbour, but nothing reaches out over a pill that opens nothing.
    const gap = within(health).getByText("Ni podatka o FIV").closest("li");
    expect(gap?.className).toContain("pointer-coarse:min-h-9");
    expect(gap?.className).not.toContain("tap-target");
    const identity = screen.getByRole("list", { name: "Podrobnosti o živali" });
    expect(within(identity).getAllByRole("listitem")[0].className).toContain(
      "pointer-coarse:min-h-9",
    );
    const conditions = screen.getByRole("list", { name: "Pogoji posvojitve" });
    expect(within(conditions).getByRole("listitem").className).toContain(
      "pointer-coarse:min-h-9",
    );
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

  // "Ni primeren za družine z majhnimi otroki" is said by the conditions row.
  // An unanswered children pill beside it would read as no answer at all.
  it("leaves children to the conditions row when that is all the shelter said", () => {
    renderFacts({ goodWith: { cats: "yes" }, adoptionRequirements: { noYoungKids: true } });

    const conditions = screen.getByRole("list", { name: "Pogoji posvojitve" });
    expect(within(conditions).getByText("Potrebuje dom brez majhnih otrok")).toBeTruthy();
    const row = screen.getByRole("list", { name: "Družba" });
    expect(within(row).getAllByRole("listitem")).toHaveLength(2);
    expect(within(row).queryByText("Ni podatka o otrocih")).toBeNull();
    expect(within(row).getByText("Ni podatka o psih")).toBeTruthy();
  });

  it("draws no row when the condition is the only answer about children", () => {
    renderFacts({ goodWith: { kids: "unknown" }, adoptionRequirements: { noYoungKids: true } });
    expect(screen.queryByRole("list", { name: "Družba" })).toBeNull();
  });

  it("keeps a recorded answer about children beside the condition", () => {
    renderFacts({ goodWith: { kids: "no" }, adoptionRequirements: { noYoungKids: true } });
    const row = screen.getByRole("list", { name: "Družba" });
    expect(within(row).getByText("Raje brez otrok")).toBeTruthy();
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

    expect(descriptionBlock()?.getAttribute("lang")).toBe("sl");
  });

  it("says nothing about the language on a Slovenian page", () => {
    renderFacts({ shortDescription: DESCRIPTION });

    // The document already declares it, and repeating it here would be one
    // more attribute on 466 pages saying what the html element says.
    expect(descriptionBlock()?.getAttribute("lang")).toBeNull();
  });

  it("prints a short description whole", () => {
    renderFacts({ shortDescription: DESCRIPTION });

    expect(descriptionBlock()?.className).not.toContain("line-clamp-5");
    expect(screen.queryByRole("button", { name: "Preberi več" })).toBeNull();
  });

  it("clamps a long one", () => {
    const long = DESCRIPTION.repeat(8);
    renderFacts({ shortDescription: long });

    expect(descriptionBlock()?.className).toContain("line-clamp-5");
    expect(screen.getByRole("button", { name: "Preberi več" })).toBeTruthy();
  });

  // The clamp is five lines, and the text is printed whitespace-pre-line, so
  // a listing set out a line at a time is over that long before it is over
  // the character count. It used to be measured by length alone and stood
  // there at full height.
  it("clamps a short one the shelter set out in lines", () => {
    const lines = "Muri\nMuca\n3 leta\nSamica\nCepljena\nSterilizirana";
    renderFacts({ shortDescription: lines });

    expect(screen.getByText(/Sterilizirana/)).toBeTruthy();
    expect(descriptionBlock()?.className).toContain("line-clamp-5");
    expect(screen.getByRole("button", { name: "Preberi več" })).toBeTruthy();
  });

  it("leaves four lines alone", () => {
    const lines = "Muri\nMuca\n3 leta\nSamica";
    renderFacts({ shortDescription: lines });

    expect(screen.getByText(/Samica/)).toBeTruthy();
    expect(descriptionBlock()?.className).not.toContain("line-clamp-5");
    expect(screen.queryByRole("button", { name: "Preberi več" })).toBeNull();
  });

  // The shelters separate paragraphs with a blank line, and printing the whole
  // text as one pre-line paragraph made that blank line a line of the clamp.
  // On 33 of the 189 clamped descriptions it was the fifth one, and the clamp
  // drew its ellipsis alone on an empty line above the button.
  it("prints the shelter's paragraphs one element each", () => {
    renderFacts({
      shortDescription: "NOVI DOM IŠČE ČARLI!\n\nČarli je mešanec.",
    });

    const paragraphs = descriptionBlock()?.querySelectorAll("p") ?? [];
    expect(paragraphs.length).toBe(2);
    expect(paragraphs[0]?.textContent).toBe("NOVI DOM IŠČE ČARLI!");
    expect(paragraphs[1]?.textContent).toBe("Čarli je mešanec.");
  });

  it("spends no clamp line on the blank line between paragraphs", () => {
    // Four lines of text and three blank ones between them: six breaks, which
    // used to clamp a description the reader can see all of.
    renderFacts({
      shortDescription: "Muri\n\nMuca\n\n3 leta\n\nSamica",
    });

    expect(descriptionBlock()?.className).not.toContain("line-clamp-5");
    expect(screen.queryByRole("button", { name: "Preberi več" })).toBeNull();
  });

  it("counts a run of blank lines as one break", () => {
    renderFacts({ shortDescription: "Muri\n\n\n\nMuca" });

    expect(descriptionBlock()?.querySelectorAll("p").length).toBe(2);
  });

  // The breaks inside a paragraph are the shelter's own, and a listing set out
  // a line at a time is still over the clamp's five lines.
  it("keeps the single breaks the shelter wrote inside a paragraph", () => {
    renderFacts({ shortDescription: "Muri\nMuca" });

    const paragraphs = descriptionBlock()?.querySelectorAll("p") ?? [];
    expect(paragraphs.length).toBe(1);
    expect(paragraphs[0]?.textContent).toBe("Muri\nMuca");
    expect(paragraphs[0]?.className).toContain("whitespace-pre-line");
  });

  // The button says nothing about what it opens on its own, and the sentence
  // it opens is not its own text.
  it("names the paragraph the read-more button expands", () => {
    const long = DESCRIPTION.repeat(8);
    renderFacts({ shortDescription: long });

    const button = screen.getByRole("button", { name: "Preberi več" });
    expect(button.getAttribute("aria-controls")).toBe(descriptionBlock()?.id);
    expect(descriptionBlock()?.id).not.toBe("");
  });

  // The animal's own page is server-rendered from a whole dataset animal, so
  // the text is already in the markup and there is nothing to go and get.
  it("prints the animal's own description without fetching", () => {
    const fetch = serving({ a1: { description: "Kar je prišlo iz datoteke." } });

    renderFacts({ shortDescription: DESCRIPTION });

    expect(screen.getByText(DESCRIPTION)).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();
  });

  // The grid's dialog, where the home page no longer ships 503 descriptions
  // to print at most one. See lib/animal-descriptions.ts.
  it("fetches the text for an animal that arrived without one", async () => {
    serving({ a1: { description: DESCRIPTION } });

    renderFacts();

    expect(screen.queryByText(DESCRIPTION)).toBeNull();
    expect(await screen.findByText(DESCRIPTION)).toBeTruthy();
  });

  it("draws no paragraph when neither the animal nor the file has one", async () => {
    serving({ a2: { description: DESCRIPTION } });

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
    serving({ a1: { description: long } });

    renderFacts();

    expect(await screen.findByText(/Zelo prijazna muca/)).toBeTruthy();
    expect(descriptionBlock()?.className).toContain("line-clamp-5");
    expect(screen.getByRole("button", { name: "Preberi več" })).toBeTruthy();
  });
});

// Two dogs at Horjul have the photographer's credit as their whole
// description. Sixteen more carry the same line after a real one, where it is
// the sign-off the shelter meant it as.
describe("a description that is only a photo credit", () => {
  it("draws no paragraph for it", () => {
    renderFacts({ name: "Mia", shortDescription: "Foto Anja Troha" });

    expect(descriptionBlock()).toBeNull();
    expect(screen.queryByText(/Anja Troha/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Preberi več" })).toBeNull();
  });

  it("drops it whichever way the shelter punctuated it", () => {
    renderFacts({ shortDescription: "Fotografije: Anja Troha" });

    expect(descriptionBlock()).toBeNull();
  });

  it("keeps the credit that follows a real description", () => {
    const description = "Miško išče dom.\n\nFoto Anja Troha";
    renderFacts({ shortDescription: description });

    expect(screen.getByText("Miško išče dom.")).toBeTruthy();
    expect(screen.getByText("Foto Anja Troha")).toBeTruthy();
  });

  // The word at the front is not enough on its own: the rest has to be a name
  // and nothing else.
  it("keeps a description that merely starts with the word", () => {
    const description = "Fotogeničen Miško išče nov dom";
    renderFacts({ shortDescription: description });

    expect(screen.getByText(description)).toBeTruthy();
  });
});

// Seven listings name more than one animal, and one row of pills has one age,
// one sex and one size to give for all of them.
describe("a listing that names several animals", () => {
  const SEVERAL = {
    approximateAgeMonths: 84,
    sex: "female",
    size: "medium",
  } satisfies Partial<Animal>;

  it("leaves the age, the sex and the size to the shelter's text", () => {
    renderFacts({ name: "DISEL, LYANN, LUNA", ...SEVERAL });

    expect(
      screen.queryByRole("list", { name: "Podrobnosti o živali" }),
    ).toBeNull();
  });

  it("reads a pair joined by in the same way", () => {
    renderFacts({ name: "Bria in Brin", ...SEVERAL });

    expect(
      screen.queryByRole("list", { name: "Podrobnosti o živali" }),
    ).toBeNull();
  });

  // The seventh is not a list, so splitting the name cannot see it. "Božanska
  // družina" is a mother and her two sons, and the row read "Samec".
  it("reads a collective name the same way", () => {
    renderFacts({ name: "Božanska družina", ...SEVERAL });

    expect(
      screen.queryByRole("list", { name: "Podrobnosti o živali" }),
    ).toBeNull();
  });

  it("keeps the health pills, which answer for the listing as a whole", () => {
    renderFacts({
      name: "Iris in Melisa",
      ...SEVERAL,
      medical: { fiv: "negative", felv: "negative" },
    });

    const row = screen.getByRole("list", { name: "Zdravje" });
    expect(within(row).getByText("Brez FIV")).toBeTruthy();
  });

  it("leaves a name of two words alone", () => {
    renderFacts({ name: "Peter Zajec", ...SEVERAL });

    expect(
      screen.getByRole("list", { name: "Podrobnosti o živali" }),
    ).toBeTruthy();
  });

  it("leaves a name the shelter wrote a description into alone", () => {
    renderFacts({ name: "brezrepa tritačka Luna", ...SEVERAL });

    expect(
      screen.getByRole("list", { name: "Podrobnosti o živali" }),
    ).toBeTruthy();
  });
});

describe("the special care pill", () => {
  it("says nothing unless the shelter marked the animal", () => {
    renderFacts({ specialNeeds: false });
    expect(
      screen.queryByRole("list", { name: "Pogoji posvojitve" }),
    ).toBeNull();
    expect(
      screen.queryByText("Potrebuje veliko potrpežljivosti"),
    ).toBeNull();
  });

  // A pill carries a label, not a sentence, and the words are the need behind
  // the filter's Potrpežljivost row: a visitor who ticked it should recognise
  // them here.
  it("asks for the right person in the words the filter uses", () => {
    renderFacts({ specialNeeds: true });

    const conditions = screen.getByRole("list", {
      name: "Pogoji posvojitve",
    });
    expect(
      within(conditions).getByText("Potrebuje veliko potrpežljivosti"),
    ).toBeTruthy();
    expect(
      screen.queryByText(
        "Ta žival potrebuje potrpežljivega človeka in nekaj več časa.",
      ),
    ).toBeNull();
  });

  // The filter gives an animal to the row of its most specific need, and the
  // pills follow it: one needing daily care says that, not patience as well.
  it("leaves the patience pill to animals no narrower need claims", () => {
    renderFacts({
      specialNeeds: true,
      adoptionRequirements: { ongoingCare: true },
    });

    const conditions = screen.getByRole("list", {
      name: "Pogoji posvojitve",
    });
    expect(
      within(conditions).getByText("Potrebuje dnevno nego"),
    ).toBeTruthy();
    expect(
      within(conditions).queryByText("Potrebuje veliko potrpežljivosti"),
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
    expect(within(conditions).getByText("Needs an indoor-only home")).toBeTruthy();
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
      indoorOnly: true, bondedPair: true, experiencedCarer: true, ongoingCare: true, noYoungKids: true,
    } }, "en");
    for (const label of ["Needs an indoor-only home", "Adopted only as a pair", "Needs an experienced hand", "Needs daily care",
      "Needs a home without young children"]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });

  it("does not present false or absent requirements as confirmed", () => {
    renderFacts({ adoptionRequirements: { indoorOnly: false, bondedPair: true } }, "en");
    expect(screen.getByText("Adopted only as a pair")).toBeTruthy();
    for (const label of ["Needs an indoor-only home", "Needs an experienced hand", "Needs daily care"]) {
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
      ).getByText("Needs an indoor-only home"),
    ).toBeTruthy();
    expect(screen.getByText(description)).toBeTruthy();
  });
});
