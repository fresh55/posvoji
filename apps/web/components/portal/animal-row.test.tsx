// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PortalAnimalRow } from "@/components/portal/animal-row";
import { fill, portalText } from "@/components/portal/portal-text";
import type { PortalAnimal, PortalShelter } from "@/lib/portal-api";

afterEach(cleanup);

// jsdom lays nothing out, so it has neither of the two the row's menus and
// animations reach for while they measure themselves.
Element.prototype.scrollTo = vi.fn();
Element.prototype.scrollIntoView = vi.fn();

const IDLE = { status: "idle" } as const;

const SHELTER: PortalShelter = {
  slug: "testno",
  name: "Zavetišče Testno",
  city: "Ljubljana",
};

/** Every searchable field answered, so a test can leave exactly n of them out. */
const ANSWERED = {
  energy: "calm",
  goodWithKids: "yes",
  goodWithDogs: "no",
  goodWithCats: "unknown",
  apartmentOk: "yes",
} as const;

function animal(overrides: Partial<PortalAnimal> = {}): PortalAnimal {
  return {
    id: "testno:1",
    species: "cat",
    status: "available",
    name: "Muri",
    breed: null,
    sex: "female",
    birthDate: null,
    approximateAgeMonths: 24,
    size: null,
    energy: null,
    goodWithKids: null,
    goodWithDogs: null,
    goodWithCats: null,
    apartmentOk: null,
    specialNeeds: null,
    shortDescription: null,
    thumbnailUrl: null,
    overrides: {},
    ...overrides,
  };
}

/** The factory animal with all five answered but the first `missing` of them. */
function withMissing(missing: number): PortalAnimal {
  const answered = Object.fromEntries(
    Object.entries(ANSWERED).slice(missing),
  ) as Partial<PortalAnimal>;
  return animal(answered);
}

function row(props: Partial<Parameters<typeof PortalAnimalRow>[0]> = {}) {
  return render(
    <PortalAnimalRow
      animal={animal()}
      shelter={SHELTER}
      saveState={IDLE}
      onSave={vi.fn().mockResolvedValue(true)}
      {...props}
    />,
  );
}

function openRowMenu(name = "Muri"): HTMLElement {
  // The three dots carry no word, so the animal is the whole name of the
  // trigger. Radix opens on pointerdown or on Enter; jsdom's pointerdown
  // arrives without the button and pointerType fields the pointer path
  // checks, so the keyboard path is the one that works here.
  fireEvent.keyDown(
    screen.getByRole("button", { name: fill(portalText.rowMenu, { name }) }),
    { key: "Enter" },
  );
  return screen.getByRole("menu");
}

describe("what the row says about the animal", () => {
  it("opens the editor from the name", () => {
    row();

    const link = screen.getByRole("link", { name: "Muri" });
    expect(link.getAttribute("href")).toBe(
      "/portal/zival?zavetisce=testno&id=testno%3A1",
    );
  });

  it("names an animal the crawl found no name for", () => {
    row({ animal: animal({ name: null }) });

    expect(screen.getByRole("link", { name: portalText.unnamed })).toBeTruthy();
  });

  it("carries the species, the breed and the age on one line", () => {
    row({ animal: animal({ breed: "mešanec" }) });

    expect(screen.getByText(/Mačka · mešanec · samica/)).toBeTruthy();
  });

  it("marks an animal the shelter has edited", () => {
    row({ animal: animal({ name: "Murka", overrides: { name: "Murka" } }) });

    expect(
      screen.getByLabelText(fill(portalText.editedCount, { count: 1 })),
    ).toBeTruthy();
  });

  it("marks an animal whose editor page holds unsaved work", () => {
    row({ hasDraft: true });

    expect(screen.getByText(portalText.draftBadge)).toBeTruthy();
  });

  it("leaves both marks off an animal that has neither", () => {
    row();

    expect(screen.queryByText(portalText.edited)).toBeNull();
    expect(screen.queryByText(portalText.draftBadge)).toBeNull();
  });
});

describe("the fields the public filters need", () => {
  /** The cell, found by the text it shows: that is its whole name. */
  function missingLink(): HTMLElement {
    return screen.getByRole("link", {
      name: (name) => name.includes("manjka"),
    });
  }

  it("counts them and opens the editor at the first one", () => {
    row();

    expect(missingLink().textContent).toBe("5 manjka");
    const href = missingLink().getAttribute("href");
    expect(href).toContain("/portal/zival?");
    expect(href).toContain("zavetisce=testno");
    expect(href).toContain("id=testno%3A1");
    expect(href).toContain("polje=energy");
  });

  it("names the cell by what it says, not by a hidden label", () => {
    row();

    // WCAG 2.5.3: the visible text is the accessible name, so voice control
    // can say it. The explanation rides along as the title.
    expect(missingLink().getAttribute("title")).toBe(
      fill(portalText.missingOpen, { name: "Muri" }),
    );
  });

  it("puts the verb in the form the count wants", () => {
    // Slovenian counts in four forms and the cell is read 150 times down one
    // list, so the wrong one is not a detail the shelter can unsee.
    for (const [missing, text] of [
      [1, "1 manjka"],
      [2, "2 manjkata"],
      [3, "3 manjkajo"],
      [5, "5 manjka"],
    ] as const) {
      cleanup();
      row({ animal: withMissing(missing) });
      expect(missingLink().textContent).toBe(text);
    }
  });

  it("says the animal is done once all five are answered", () => {
    row({ animal: animal(ANSWERED) });

    expect(screen.queryByText(/manjka/)).toBeNull();
    // A tick carries it in the row; the sentence is there for a screen reader.
    expect(screen.getByText(portalText.missingNone)).toBeTruthy();
  });
});

describe("the menu at the end of the row", () => {
  it("holds both ways out of the list", () => {
    row();
    openRowMenu();

    const items = screen.getAllByRole("menuitem");
    expect(items[0]?.textContent).toContain(portalText.edit);
    expect(items[0]?.getAttribute("href")).toBe(
      "/portal/zival?zavetisce=testno&id=testno%3A1",
    );
    expect(items[1]?.textContent).toContain(portalText.publicListing);
    // animalPath()'s output: the name with the id's suffix, then the town and
    // the shelter, under the Slovenian prefix.
    expect(items[1]?.getAttribute("href")).toMatch(
      /^\/zival\/muri-[0-9a-f]{6}\/ljubljana\/testno$/,
    );
    expect(items[1]?.getAttribute("target")).toBe("_blank");
  });

  it("says in the menu why the public link carries the old name", () => {
    // The public site is a static export rebuilt about every twelve hours and
    // has no page for a name saved since. A hover title would say this to a
    // mouse alone, so it is a second line of the item instead.
    row({
      animal: animal({ name: "Murka", overrides: { name: "Murka" } }),
      publicName: "Muri",
    });
    openRowMenu("Murka");

    expect(screen.getByText(portalText.publicRenamed)).toBeTruthy();
    expect(
      screen.getAllByRole("menuitem")[1]?.getAttribute("href"),
    ).toMatch(/^\/zival\/muri-[0-9a-f]{6}\/ljubljana\/testno$/);
  });

  it("says nothing about publication when the name has not moved", () => {
    row({ publicName: "Muri" });
    openRowMenu();

    expect(screen.queryByText(portalText.publicRenamed)).toBeNull();
  });
});

describe("what a save says", () => {
  it("flashes the outcome of one that worked", () => {
    row({ saveState: { status: "saved" } as const });

    expect(screen.getByText(portalText.saved)).toBeTruthy();
  });

  it("says nothing while the row is idle", () => {
    row();

    expect(screen.queryByText(portalText.saved)).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("carries a failure as its own line under the row", () => {
    row({
      saveState: { status: "error", message: portalText.saveError } as const,
    });

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain(portalText.saveError);
  });
});
