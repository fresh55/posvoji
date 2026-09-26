// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PortalProvider } from "@/components/portal/portal-provider";
import { fill, portalText } from "@/components/portal/portal-text";
import {
  QuickAnswersPage,
  roundKey,
} from "@/components/portal/quick-answers-page";
import {
  PortalError,
  fetchAnimals,
  fetchListings,
  fetchSession,
  saveAnimal,
  updateListing,
  type PortalAnimal,
  type PortalAnimalPatch,
  type PortalListing,
  type PortalPublished,
  type PortalShelter,
} from "@/lib/portal-api";

// The page reads the address once, when it opens. The mock hands it the
// query a visitor would have typed or reloaded on.
let search = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useSearchParams: () => search,
  usePathname: () => "/portal/odgovori",
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

// Only the calls the page makes are stubbed; PortalError and isUnauthorized
// stay the real ones, because the hooks branch on them.
vi.mock("@/lib/portal-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/portal-api")>()),
  fetchSession: vi.fn(),
  fetchAnimals: vi.fn(),
  fetchListings: vi.fn(),
  saveAnimal: vi.fn(),
  updateListing: vi.fn(),
}));

Object.defineProperty(window, "matchMedia", {
  configurable: true,
  value: vi.fn().mockImplementation((media: string) => ({
    matches: false,
    media,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })),
});

// jsdom lays nothing out. A step scrolls the next animal into view.
Element.prototype.scrollIntoView = vi.fn();

const ACCOUNT = "info@zavetisce.si";

const SHELTER: PortalShelter = {
  slug: "testno",
  name: "Zavetišče Testno",
  city: "Ljubljana",
};

const MANUAL: PortalShelter = {
  slug: "johanca",
  name: "Zavetišče JoHanca",
  city: "Kranj",
  ingestion: "manual",
};

/** A dog with none of the five answers. */
function animal(over: Partial<PortalAnimal> = {}): PortalAnimal {
  return {
    id: "testno:1",
    species: "dog",
    status: "available",
    name: "Rex",
    breed: null,
    sex: "male",
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
    ...over,
  };
}

/** Every answer a dog is asked, given. */
const ANSWERED: Partial<PortalAnimal> = {
  goodWithKids: "yes",
  goodWithDogs: "yes",
  goodWithCats: "no",
  size: "large",
  energy: "lively",
};

const LISTING: PortalListing = {
  providerId: "johanca",
  id: "6d1c0f6a-3c0e-4a7e-9f7b-2f4a9d1e8b10",
  species: "cat",
  status: "available",
  name: "Luna",
  sex: "female",
  breed: null,
  birthDate: null,
  approximateAgeMonths: 8,
  size: null,
  energy: null,
  goodWithKids: null,
  goodWithDogs: null,
  goodWithCats: "yes",
  apartmentOk: null,
  specialNeeds: null,
  shortDescription: "Radovedna.",
  photos: [],
  createdAt: "2026-09-01T10:00:00Z",
  updatedAt: "2026-09-01T10:00:00Z",
  archivedAt: null,
};

/** The address the page is opened on, as a visit or a reload would have it. */
function visit(query: Record<string, string>) {
  search = new URLSearchParams(query);
  window.history.replaceState(null, "", `/portal/odgovori?${search}`);
}

function signIn(shelters: PortalShelter[] = [SHELTER]) {
  vi.mocked(fetchSession).mockResolvedValue({ email: ACCOUNT, shelters });
}

/**
 * A server that stores what it is sent, the way the override route does: a
 * value becomes the shelter's own, a null gives the field back to the crawl,
 * which in these fixtures has nothing under it.
 */
function serve(animals: PortalAnimal[]) {
  const stored = new Map(animals.map((one) => [one.id, one]));
  vi.mocked(fetchAnimals).mockResolvedValue(animals);
  vi.mocked(saveAnimal).mockImplementation(async (_slug, id, patch) => {
    const before = stored.get(id)!;
    const after: PortalAnimal = { ...before, overrides: { ...before.overrides } };
    for (const [field, value] of Object.entries(patch) as [
      keyof PortalAnimalPatch,
      PortalAnimalPatch[keyof PortalAnimalPatch],
    ][]) {
      (after as Record<string, unknown>)[field] = value;
      if (value === null) delete after.overrides[field];
      else after.overrides[field] = value;
    }
    stored.set(id, after);
    return after;
  });
}

async function open(animals: PortalAnimal[], query?: Record<string, string>) {
  signIn();
  serve(animals);
  visit(query ?? { zavetisce: "testno" });
  render(
    <PortalProvider>
      <QuickAnswersPage />
    </PortalProvider>,
  );
  await waitFor(() => {
    expect(screen.getByRole("heading", { level: 2 })).toBeTruthy();
  });
}

/** The animal on screen. */
function shown(): string {
  return screen.getByRole("heading", { level: 2 }).textContent ?? "";
}

function row(question: string): HTMLElement {
  return screen.getByRole("radiogroup", { name: question });
}

function card(question: string, answer: string): HTMLElement {
  return within(row(question)).getByRole("radio", { name: answer });
}

function checked(question: string, answer: string): boolean {
  return card(question, answer).getAttribute("aria-checked") === "true";
}

function nextButton(): HTMLButtonElement {
  return screen.getByRole("button", {
    name: new RegExp(`^(${portalText.quickNext}|${portalText.quickFinish})$`),
  }) as HTMLButtonElement;
}

function previousButton(): HTMLButtonElement {
  return screen.getByRole("button", {
    name: portalText.quickPrevious,
  }) as HTMLButtonElement;
}

function progress(index: number, count: number): HTMLElement | null {
  return screen.queryByText(fill(portalText.quickProgress, { index, count }));
}

afterEach(cleanup);

beforeEach(() => {
  // A round is kept for the tab, so every test starts in a tab never used.
  window.sessionStorage.clear();
  vi.mocked(fetchSession).mockReset();
  vi.mocked(fetchAnimals).mockReset();
  vi.mocked(fetchListings).mockReset();
  vi.mocked(saveAnimal).mockReset();
  vi.mocked(updateListing).mockReset();
});

describe("the answers already there", () => {
  it("shows what the crawl read and what the shelter chose", async () => {
    await open([
      animal({
        goodWithCats: "yes",
        energy: "calm",
        overrides: { energy: "calm" },
      }),
    ]);

    expect(checked(portalText.quickCats, "Da")).toBe(true);
    expect(checked(portalText.fieldEnergy, "Miren")).toBe(true);
    // Nothing is chosen where nothing is known.
    for (const answer of ["Da", "Ne", portalText.quickUnknown]) {
      expect(checked(portalText.quickKids, answer)).toBe(false);
    }
  });

  it("shows a stored unknown as Ne vem", async () => {
    await open([animal({ goodWithDogs: "unknown" })]);

    expect(checked(portalText.quickDogs, portalText.quickUnknown)).toBe(true);
  });
});

describe("answers the public site already shows", () => {
  const NOTHING: PortalPublished = {
    size: null,
    energy: null,
    goodWithKids: null,
    goodWithDogs: null,
    goodWithCats: null,
    apartmentOk: null,
  };

  it("chooses them, in the order the site decides", async () => {
    await open([
      animal({
        // The crawl says medium; the published dataset, which the site is
        // built from, says large.
        size: "medium",
        // The shelter has answered since the last export.
        energy: "calm",
        overrides: { energy: "calm" },
        published: {
          ...NOTHING,
          size: "large",
          energy: "lively",
          goodWithCats: "yes",
        },
      }),
    ]);

    expect(checked(portalText.fieldSize, "Velika")).toBe(true);
    expect(checked(portalText.fieldEnergy, "Miren")).toBe(true);
    expect(checked(portalText.quickCats, "Da")).toBe(true);
    expect(checked(portalText.quickKids, "Da")).toBe(false);
  });

  it("asks only the animals still missing one, and counts them so", async () => {
    await open([
      animal({ id: "testno:1", name: "Ajda" }),
      // Every answer the page asks is published: nothing to ask.
      animal({
        id: "testno:2",
        name: "Bor",
        published: {
          ...NOTHING,
          size: "small",
          energy: "calm",
          goodWithKids: "yes",
          goodWithDogs: "no",
          goodWithCats: "unknown",
        },
      }),
      animal({ id: "testno:3", name: "Cene" }),
    ]);

    expect(shown()).toBe("Ajda");
    expect(progress(1, 2)).toBeTruthy();
    fireEvent.click(nextButton());
    await waitFor(() => expect(shown()).toBe("Cene"));
  });

  it("keeps one on Ne vem and says why", async () => {
    await open([
      animal({ published: { ...NOTHING, goodWithCats: "no", energy: "lively" } }),
    ]);

    fireEvent.click(card(portalText.fieldEnergy, portalText.quickUnknown));

    expect(saveAnimal).not.toHaveBeenCalled();
    expect(checked(portalText.fieldEnergy, "Živahen")).toBe(true);
    expect(screen.getByText(portalText.quickUnknownPublic)).toBeTruthy();
  });

  it("saves another answer over one as the shelter's own", async () => {
    await open([animal({ published: { ...NOTHING, energy: "lively" } })]);

    fireEvent.click(card(portalText.fieldEnergy, "Miren"));

    expect(saveAnimal).toHaveBeenCalledWith("testno", "testno:1", {
      energy: "calm",
    });
    await waitFor(() => expect(checked(portalText.fieldEnergy, "Miren")).toBe(true));
  });

  // The published dataset carries the corrections of the last export. Taking
  // the shelter's own answer back shows what the site still shows until the
  // next one, and says it stays until another is picked.
  it("shows the published answer again once the shelter's own is taken back", async () => {
    await open([
      animal({
        energy: "calm",
        overrides: { energy: "calm" },
        published: { ...NOTHING, energy: "lively" },
      }),
    ]);

    fireEvent.click(card(portalText.fieldEnergy, portalText.quickUnknown));

    expect(saveAnimal).toHaveBeenCalledWith("testno", "testno:1", {
      energy: null,
    });
    await waitFor(() => {
      expect(screen.getByText(portalText.quickUnknownPublic)).toBeTruthy();
    });
    expect(checked(portalText.fieldEnergy, "Živahen")).toBe(true);
  });
});

describe("a tap", () => {
  it("saves that one answer at once and says so", async () => {
    await open([animal()]);

    fireEvent.click(card(portalText.quickKids, "Da"));

    expect(saveAnimal).toHaveBeenCalledWith("testno", "testno:1", {
      goodWithKids: "yes",
    });
    await waitFor(() => {
      expect(screen.getByText(portalText.saved)).toBeTruthy();
    });
    expect(checked(portalText.quickKids, "Da")).toBe(true);
  });

  // Ne vem is not stored as "unknown": the public filters read that as no
  // answer, and the portal's crawl is the one before the reviewed enrichment,
  // so a stored unknown could replace an answer the shelter cannot see here.
  it("sends nothing for Ne vem on an empty household question", async () => {
    await open([animal()]);

    fireEvent.click(card(portalText.quickDogs, portalText.quickUnknown));

    expect(saveAnimal).not.toHaveBeenCalled();
    expect(checked(portalText.quickDogs, portalText.quickUnknown)).toBe(true);
    expect(screen.getByText(portalText.quickUnknownOpen)).toBeTruthy();
  });

  it("takes the shelter's own household answer back on Ne vem", async () => {
    await open([
      animal({ goodWithKids: "no", overrides: { goodWithKids: "no" } }),
    ]);

    fireEvent.click(card(portalText.quickKids, portalText.quickUnknown));

    expect(saveAnimal).toHaveBeenCalledWith("testno", "testno:1", {
      goodWithKids: null,
    });
    await waitFor(() => {
      expect(screen.getByText(portalText.quickUnknownOpen)).toBeTruthy();
    });
    expect(checked(portalText.quickKids, portalText.quickUnknown)).toBe(true);
  });

  it("keeps a household answer the crawl read and says why", async () => {
    await open([animal({ goodWithCats: "yes" })]);

    fireEvent.click(card(portalText.quickCats, portalText.quickUnknown));

    expect(saveAnimal).not.toHaveBeenCalled();
    expect(checked(portalText.quickCats, "Da")).toBe(true);
    expect(screen.getByText(portalText.quickUnknownPublic)).toBeTruthy();
  });

  // The data has no "unknown" energy: an empty field is how it says so.
  it("sends nothing for Ne vem on an empty energy, and says it stays open", async () => {
    await open([animal()]);

    fireEvent.click(card(portalText.fieldEnergy, portalText.quickUnknown));

    expect(saveAnimal).not.toHaveBeenCalled();
    expect(checked(portalText.fieldEnergy, portalText.quickUnknown)).toBe(true);
    expect(screen.getByText(portalText.quickUnknownOpen)).toBeTruthy();
  });

  it("takes the shelter's own energy back on Ne vem", async () => {
    await open([animal({ energy: "lively", overrides: { energy: "lively" } })]);

    fireEvent.click(card(portalText.fieldEnergy, portalText.quickUnknown));

    expect(saveAnimal).toHaveBeenCalledWith("testno", "testno:1", {
      energy: null,
    });
    await waitFor(() => {
      expect(screen.getByText(portalText.quickUnknownOpen)).toBeTruthy();
    });
    expect(checked(portalText.fieldEnergy, portalText.quickUnknown)).toBe(true);
  });

  // The portal can replace a value read off the shelter's own page but not
  // empty it, so the page says why the card it shows is still on.
  it("keeps a size the crawl read and says why", async () => {
    await open([animal({ size: "medium" })]);

    fireEvent.click(card(portalText.fieldSize, portalText.quickUnknown));

    expect(saveAnimal).not.toHaveBeenCalled();
    expect(checked(portalText.fieldSize, "Srednja")).toBe(true);
    expect(screen.getByText(portalText.quickUnknownPublic)).toBeTruthy();
  });

  it("queues a second tap behind a save still out, instead of dropping it", async () => {
    await open([animal()]);
    let land: () => void = () => {};
    const first = vi.mocked(saveAnimal).getMockImplementation()!;
    vi.mocked(saveAnimal).mockImplementationOnce(
      (slug, id, patch) =>
        new Promise((resolve) => {
          land = () => resolve(first(slug, id, patch));
        }),
    );

    fireEvent.click(card(portalText.quickKids, "Da"));
    fireEvent.click(card(portalText.quickDogs, "Ne"));

    // Both show at once, one save is out.
    expect(checked(portalText.quickKids, "Da")).toBe(true);
    expect(checked(portalText.quickDogs, "Ne")).toBe(true);
    expect(saveAnimal).toHaveBeenCalledTimes(1);

    land();

    await waitFor(() => expect(saveAnimal).toHaveBeenCalledTimes(2));
    expect(saveAnimal).toHaveBeenLastCalledWith("testno", "testno:1", {
      goodWithDogs: "no",
    });
  });

  // The second save is built on what the first one stored: by then the energy
  // is the shelter's own, so Ne vem has something to take back.
  it("builds the next save on what the one before it stored", async () => {
    await open([animal()]);
    let land: () => void = () => {};
    const store = vi.mocked(saveAnimal).getMockImplementation()!;
    vi.mocked(saveAnimal).mockImplementationOnce(
      (slug, id, patch) =>
        new Promise((resolve) => {
          land = () => resolve(store(slug, id, patch));
        }),
    );

    fireEvent.click(card(portalText.fieldEnergy, "Živahen"));
    fireEvent.click(card(portalText.fieldEnergy, portalText.quickUnknown));
    land();

    await waitFor(() => expect(saveAnimal).toHaveBeenCalledTimes(2));
    expect(saveAnimal).toHaveBeenNthCalledWith(1, "testno", "testno:1", {
      energy: "lively",
    });
    expect(saveAnimal).toHaveBeenNthCalledWith(2, "testno", "testno:1", {
      energy: null,
    });
    await waitFor(() => {
      expect(screen.getByText(portalText.quickUnknownOpen)).toBeTruthy();
    });
  });

  it("says a failed save in the bar and shows what is stored again", async () => {
    await open([animal()]);
    vi.mocked(saveAnimal).mockRejectedValue(new PortalError(500));

    fireEvent.click(card(portalText.quickKids, "Da"));

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain(
        portalText.saveError,
      );
    });
    expect(checked(portalText.quickKids, "Da")).toBe(false);
  });
});

describe("the questions", () => {
  it("asks a cat everything but its size", async () => {
    await open([animal({ species: "cat", name: "Muri" })]);

    expect(screen.queryByRole("radiogroup", { name: portalText.fieldSize })).toBeNull();
    expect(row(portalText.fieldEnergy)).toBeTruthy();
    expect(screen.getAllByRole("radiogroup")).toHaveLength(4);
  });

  it("asks a dog all five, with the editor's cards", async () => {
    await open([animal()]);

    expect(screen.getAllByRole("radiogroup")).toHaveLength(5);
    expect(within(row(portalText.fieldSize)).getAllByRole("radio")).toHaveLength(4);
    expect(card(portalText.fieldSize, "Majhna")).toBeTruthy();
    expect(card(portalText.fieldEnergy, "Uravnotežen")).toBeTruthy();
  });
});

describe("moving through the round", () => {
  const ROUND = [
    animal({ id: "testno:1", name: "Ajda" }),
    // Complete before the round began: never part of it.
    animal({ id: "testno:2", name: "Bor", ...ANSWERED }),
    animal({ id: "testno:3", name: "Cene", species: "cat" }),
    animal({ id: "testno:4", name: "Dora" }),
  ];

  it("counts only the animals still missing an answer", async () => {
    await open(ROUND);

    expect(shown()).toBe("Ajda");
    expect(progress(1, 3)).toBeTruthy();
    expect(previousButton().disabled).toBe(true);
    expect(window.location.search).toBe("?zavetisce=testno&id=testno%3A1");
  });

  it("goes forward past answered animals and back again", async () => {
    await open(ROUND);

    fireEvent.click(nextButton());
    await waitFor(() => expect(shown()).toBe("Cene"));
    expect(progress(2, 3)).toBeTruthy();
    expect(window.location.search).toBe("?zavetisce=testno&id=testno%3A3");
    // The new animal's name takes the focus, so a screen reader hears it.
    expect(document.activeElement).toBe(screen.getByRole("heading", { level: 2 }));

    fireEvent.click(previousButton());
    await waitFor(() => expect(shown()).toBe("Ajda"));
    expect(window.location.search).toBe("?zavetisce=testno&id=testno%3A1");
  });

  it("steps over an animal answered since the round began", async () => {
    await open(ROUND);
    fireEvent.click(nextButton());
    await waitFor(() => expect(shown()).toBe("Cene"));

    // Cene is a cat: four answers and it is done.
    fireEvent.click(card(portalText.quickKids, "Da"));
    fireEvent.click(card(portalText.quickDogs, "Ne"));
    fireEvent.click(card(portalText.quickCats, "Da"));
    fireEvent.click(card(portalText.fieldEnergy, "Miren"));
    await waitFor(() => expect(screen.getByText(portalText.saved)).toBeTruthy());

    fireEvent.click(previousButton());
    await waitFor(() => expect(shown()).toBe("Ajda"));
    fireEvent.click(nextButton());

    await waitFor(() => expect(shown()).toBe("Dora"));
    expect(progress(3, 3)).toBeTruthy();
  });

  it("waits for a save still out before it moves", async () => {
    await open(ROUND);
    let land: () => void = () => {};
    const store = vi.mocked(saveAnimal).getMockImplementation()!;
    vi.mocked(saveAnimal).mockImplementationOnce(
      (slug, id, patch) =>
        new Promise((resolve) => {
          land = () => resolve(store(slug, id, patch));
        }),
    );

    fireEvent.click(card(portalText.quickKids, "Da"));
    fireEvent.click(nextButton());

    expect(shown()).toBe("Ajda");
    await waitFor(() => expect(nextButton().disabled).toBe(true));

    land();

    await waitFor(() => expect(shown()).toBe("Cene"));
  });

  it("ends the round after the last one and leads back to the list", async () => {
    await open(ROUND, { zavetisce: "testno", id: "testno:4" });
    // Reloaded on the last animal, with nothing stored for the tab: a new
    // round of the three still missing answers, on Dora.
    expect(shown()).toBe("Dora");
    expect(nextButton().textContent).toBe(portalText.quickFinish);

    fireEvent.click(nextButton());

    await waitFor(() => {
      expect(screen.getByText(portalText.quickEndTitle)).toBeTruthy();
    });
    expect(
      screen.getByText(fill(portalText.quickEndMany, { count: 3 })),
    ).toBeTruthy();
    expect(
      screen.getByRole("link", { name: portalText.backToList }).getAttribute("href"),
    ).toBe("/portal");
    expect(window.location.search).toBe("?zavetisce=testno");
  });

  it("says every animal is answered when none is left", async () => {
    await open([animal({ id: "testno:1", name: "Ajda" })]);

    fireEvent.click(card(portalText.quickKids, "Da"));
    fireEvent.click(card(portalText.quickDogs, "Da"));
    fireEvent.click(card(portalText.quickCats, "Ne"));
    fireEvent.click(card(portalText.fieldSize, "Majhna"));
    fireEvent.click(card(portalText.fieldEnergy, "Živahen"));
    fireEvent.click(nextButton());

    await waitFor(() => {
      expect(screen.getByText(portalText.quickDoneTitle)).toBeTruthy();
    });
    expect(screen.getByText(portalText.quickDoneLead)).toBeTruthy();
    expect(saveAnimal).toHaveBeenLastCalledWith(
      "testno",
      "testno:1",
      expect.objectContaining({ energy: "lively" }),
    );
  });
});

describe("a reload", () => {
  it("lands on the animal the address names, answered or not", async () => {
    await open(
      [
        animal({ id: "testno:1", name: "Ajda" }),
        animal({ id: "testno:2", name: "Bor", ...ANSWERED }),
      ],
      { zavetisce: "testno", id: "testno:2" },
    );

    expect(shown()).toBe("Bor");
    expect(checked(portalText.fieldEnergy, "Živahen")).toBe(true);
  });

  it("keeps the round the tab was on, and its count", async () => {
    // Ajda and Bor were answered earlier in this round; the tab kept it.
    window.sessionStorage.setItem(
      roundKey(ACCOUNT, "testno"),
      JSON.stringify(["testno:1", "testno:2", "testno:3", "testno:4"]),
    );

    await open(
      [
        animal({ id: "testno:1", name: "Ajda", ...ANSWERED }),
        animal({ id: "testno:2", name: "Bor", ...ANSWERED }),
        animal({ id: "testno:3", name: "Cene" }),
        animal({ id: "testno:4", name: "Dora" }),
      ],
      { zavetisce: "testno", id: "testno:3" },
    );

    expect(shown()).toBe("Cene");
    expect(progress(3, 4)).toBeTruthy();
    fireEvent.click(previousButton());
    await waitFor(() => expect(shown()).toBe("Bor"));
  });
});

describe("the address", () => {
  it("does not open a shelter the account does not have", async () => {
    signIn();
    serve([animal()]);
    visit({ zavetisce: "tuje" });

    render(
      <PortalProvider>
        <QuickAnswersPage />
      </PortalProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText(portalText.quickNotFoundTitle)).toBeTruthy();
    });
    expect(fetchAnimals).not.toHaveBeenCalledWith("tuje");
  });
});

describe("a shelter that writes its own listings", () => {
  it("saves an answer through the listing's own full replace", async () => {
    signIn([MANUAL]);
    vi.mocked(fetchListings).mockResolvedValue([LISTING]);
    vi.mocked(updateListing).mockImplementation(async (_slug, _id, input) => ({
      ...LISTING,
      ...input,
    }));
    visit({ zavetisce: "johanca" });
    render(
      <PortalProvider>
        <QuickAnswersPage />
      </PortalProvider>,
    );
    await waitFor(() => expect(shown()).toBe("Luna"));

    fireEvent.click(card(portalText.quickKids, "Da"));

    expect(updateListing).toHaveBeenCalledWith("johanca", LISTING.id, {
      species: "cat",
      name: "Luna",
      status: "available",
      sex: "female",
      breed: null,
      birthDate: null,
      approximateAgeMonths: 8,
      size: null,
      energy: null,
      goodWithKids: "yes",
      goodWithDogs: null,
      goodWithCats: "yes",
      apartmentOk: null,
      specialNeeds: null,
      shortDescription: "Radovedna.",
    });
    expect(saveAnimal).not.toHaveBeenCalled();
  });

  // Each PUT replaces the whole listing, so a second one built on the listing
  // as it was before the first would put the first answer back to empty.
  it("carries the answer before into the next replace", async () => {
    signIn([MANUAL]);
    vi.mocked(fetchListings).mockResolvedValue([LISTING]);
    let land: () => void = () => {};
    vi.mocked(updateListing)
      .mockImplementationOnce(
        (_slug, _id, input) =>
          new Promise((resolve) => {
            land = () => resolve({ ...LISTING, ...input });
          }),
      )
      .mockImplementation(async (_slug, _id, input) => ({ ...LISTING, ...input }));
    visit({ zavetisce: "johanca" });
    render(
      <PortalProvider>
        <QuickAnswersPage />
      </PortalProvider>,
    );
    await waitFor(() => expect(shown()).toBe("Luna"));

    fireEvent.click(card(portalText.quickKids, "Da"));
    fireEvent.click(card(portalText.quickDogs, "Ne"));
    land();

    await waitFor(() => expect(updateListing).toHaveBeenCalledTimes(2));
    expect(updateListing).toHaveBeenLastCalledWith(
      "johanca",
      LISTING.id,
      expect.objectContaining({ goodWithKids: "yes", goodWithDogs: "no" }),
    );
  });
});
