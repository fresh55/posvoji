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
import { PortalWorkspace } from "@/components/portal/portal-workspace";
import { fill, portalText } from "@/components/portal/portal-text";
import {
  PortalError,
  fetchAnimals,
  fetchListings,
  fetchSession,
  logout,
  saveAnimal,
  type PortalAnimal,
  type PortalListing,
  type PortalShelter,
} from "@/lib/portal-api";
import { writeDraft } from "@/lib/portal-drafts";

// Only the calls the workspace makes are stubbed; PortalError and
// isUnauthorized stay the real ones, because the hooks branch on them.
vi.mock("@/lib/portal-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/portal-api")>()),
  fetchSession: vi.fn(),
  fetchAnimals: vi.fn(),
  fetchListings: vi.fn(),
  saveAnimal: vi.fn(),
  logout: vi.fn(),
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

Element.prototype.scrollTo = vi.fn();
// The list scrolls back to the card a save went to, and jsdom lays nothing
// out to scroll.
Element.prototype.scrollIntoView = vi.fn();

afterEach(cleanup);

beforeEach(() => {
  // A draft outlives the page it was typed on, so every test starts in a tab
  // that has never been used.
  window.sessionStorage.clear();
  vi.mocked(fetchSession).mockReset();
  vi.mocked(fetchAnimals).mockReset();
  vi.mocked(fetchListings).mockReset();
  vi.mocked(saveAnimal).mockReset();
  vi.mocked(logout).mockReset().mockResolvedValue(undefined);
});

const SESSION = {
  email: "info@zavetisce.si",
  shelters: [{ slug: "testno", name: "Zavetišče Testno", city: "Ljubljana" }],
};

const MANUAL: PortalShelter = {
  slug: "johanca",
  name: "Zavetišče JoHanca",
  city: "Kranj",
  ingestion: "manual",
};

// No ingestion at all: what every shelter reported before the field.
const CRAWLED: PortalShelter = {
  slug: "ljubljana",
  name: "Zavetišče Ljubljana",
  city: "Ljubljana",
};

const LISTING: PortalListing = {
  providerId: "johanca",
  id: "6d1c0f6a-3c0e-4a7e-9f7b-2f4a9d1e8b10",
  species: "cat",
  status: "available",
  name: "Luna",
  sex: null,
  breed: null,
  birthDate: null,
  approximateAgeMonths: null,
  size: null,
  energy: null,
  goodWithKids: null,
  goodWithDogs: null,
  goodWithCats: null,
  apartmentOk: null,
  specialNeeds: null,
  shortDescription: null,
  photos: [],
  createdAt: "2026-09-01T10:00:00Z",
  updatedAt: "2026-09-01T10:00:00Z",
  archivedAt: null,
};

function animal(over: Partial<PortalAnimal> = {}): PortalAnimal {
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
    ...over,
  };
}

/**
 * The workspace as the route serves it: the (app) layout mounts the provider,
 * which holds the session and the list, and the page reads them off it.
 */
function renderWorkspace() {
  return render(
    <PortalProvider>
      <PortalWorkspace />
    </PortalProvider>,
  );
}

function signIn(shelter: PortalShelter) {
  vi.mocked(fetchSession).mockResolvedValue({
    email: "info@zavetisce.si",
    shelters: [shelter],
  });
}

function headings(): HTMLElement[] {
  return screen.queryAllByRole("heading", { level: 1 });
}

function addButton(): HTMLElement | null {
  return screen.queryByRole("button", { name: portalText.listingAdd });
}

describe("what a failure tells the shelter", () => {
  it("says what failed and what to do, never the same sentence twice", async () => {
    vi.mocked(fetchSession).mockRejectedValue(new PortalError(500));

    renderWorkspace();

    await waitFor(() => {
      expect(screen.getByText(portalText.sessionErrorTitle)).toBeTruthy();
    });
    expect(screen.getByText(portalText.sessionErrorLead)).toBeTruthy();
    // The notice prints a title and a body. One sentence in both places reads
    // as a fault in the page, not as an answer.
    expect(portalText.sessionErrorLead).not.toBe(portalText.sessionErrorTitle);
    expect(screen.queryAllByText(portalText.sessionErrorTitle)).toHaveLength(1);
  });

  it("names the connection when that is what went wrong", async () => {
    vi.mocked(fetchSession).mockRejectedValue(new PortalError(0));

    renderWorkspace();

    await waitFor(() => {
      expect(screen.getByText(portalText.networkError)).toBeTruthy();
    });
    expect(screen.getByText(portalText.sessionErrorTitle)).toBeTruthy();
  });

  it("does the same for a list that will not load", async () => {
    vi.mocked(fetchSession).mockResolvedValue(SESSION);
    vi.mocked(fetchAnimals).mockRejectedValue(new PortalError(500));

    renderWorkspace();

    await waitFor(() => {
      expect(screen.getByText(portalText.listErrorTitle)).toBeTruthy();
    });
    expect(screen.getByText(portalText.listError)).toBeTruthy();
    expect(portalText.listError).not.toBe(portalText.listErrorTitle);
    expect(screen.queryAllByText(portalText.listErrorTitle)).toHaveLength(1);
  });
});

describe("the page's own heading", () => {
  it("is there while the session is still being read", () => {
    vi.mocked(fetchSession).mockReturnValue(new Promise(() => {}));

    renderWorkspace();

    expect(headings()).toHaveLength(1);
    expect(headings()[0].textContent).toBe(portalText.brand);
  });

  it("is there when the session cannot be read", async () => {
    vi.mocked(fetchSession).mockRejectedValue(new PortalError(500));

    renderWorkspace();

    await waitFor(() => {
      expect(screen.getByText(portalText.sessionErrorTitle)).toBeTruthy();
    });
    expect(headings()).toHaveLength(1);
    expect(headings()[0].textContent).toBe(portalText.brand);
  });

  it("is there when the account has no shelter yet", async () => {
    vi.mocked(fetchSession).mockResolvedValue({ ...SESSION, shelters: [] });

    renderWorkspace();

    await waitFor(() => {
      expect(screen.getByText(portalText.noSheltersTitle)).toBeTruthy();
    });
    expect(headings()).toHaveLength(1);
  });

  it("is the workspace's own name once there is a list, and only once", async () => {
    vi.mocked(fetchSession).mockResolvedValue(SESSION);
    vi.mocked(fetchAnimals).mockResolvedValue([animal()]);

    renderWorkspace();

    await waitFor(() => {
      expect(screen.getByText(portalText.animalsTitle)).toBeTruthy();
    });
    expect(headings()).toHaveLength(1);
    expect(headings()[0].textContent).toBe(portalText.animalsTitle);
  });

  // The manual branch is a second render path to the same heading, so it is
  // held to the same rule as the crawled one above.
  it("is the same name for a shelter that writes its own listings", async () => {
    signIn(MANUAL);
    vi.mocked(fetchListings).mockResolvedValue([LISTING]);

    renderWorkspace();

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Luna" })).toBeTruthy();
    });
    expect(headings()).toHaveLength(1);
    expect(headings()[0].textContent).toBe(portalText.animalsTitle);
  });
});

describe("a shelter that writes its own listings", () => {
  it("reads listings, never animals, and offers to add the first", async () => {
    signIn(MANUAL);
    vi.mocked(fetchListings).mockResolvedValue([]);
    renderWorkspace();

    await waitFor(() => {
      expect(screen.getByText(portalText.listingsEmptyLead)).toBeTruthy();
    });
    expect(fetchListings).toHaveBeenCalledWith("johanca");
    expect(fetchAnimals).not.toHaveBeenCalled();
    expect(screen.queryByText(portalText.emptyLead)).toBeNull();
    expect(addButton()).toBeTruthy();
  });

  it("lists its animals as listing cards under the add button", async () => {
    signIn(MANUAL);
    vi.mocked(fetchListings).mockResolvedValue([LISTING]);
    renderWorkspace();

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Luna" })).toBeTruthy();
    });
    expect(screen.getByText("1 žival")).toBeTruthy();
    expect(
      screen.getAllByRole("button", { name: portalText.listingAdd }),
    ).toHaveLength(1);
    // A listing card, not a crawled one: nothing to confirm off a site.
    expect(screen.queryByText(portalText.statusFromSiteLine)).toBeNull();
    expect(
      screen.queryByRole("link", { name: portalText.publicListing }),
    ).toBeNull();
  });

  it("opens the new listing form from the header", async () => {
    signIn(MANUAL);
    vi.mocked(fetchListings).mockResolvedValue([LISTING]);
    renderWorkspace();
    await waitFor(() => expect(addButton()).toBeTruthy());

    fireEvent.click(addButton() as HTMLElement);

    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText(portalText.listingNewTitle)).toBeTruthy();
  });

  it("filters the listing cards by name", async () => {
    signIn(MANUAL);
    vi.mocked(fetchListings).mockResolvedValue([
      LISTING,
      { ...LISTING, id: "b", name: "Bine" },
    ]);
    renderWorkspace();
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Bine" })).toBeTruthy();
    });

    fireEvent.change(screen.getByLabelText(portalText.searchLabel), {
      target: { value: "lun" },
    });

    expect(screen.getByRole("heading", { name: "Luna" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Bine" })).toBeNull();
  });
});

describe("a crawled shelter", () => {
  it("renders as it always has", async () => {
    signIn(CRAWLED);
    vi.mocked(fetchAnimals).mockResolvedValue([
      animal({ id: "ljubljana:1", species: "dog", name: "Rex", sex: null }),
    ]);
    renderWorkspace();

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Rex" })).toBeTruthy();
    });
    expect(fetchAnimals).toHaveBeenCalledWith("ljubljana");
    expect(fetchListings).not.toHaveBeenCalled();
    expect(addButton()).toBeNull();
    // The crawled card, provenance line and public link included.
    expect(screen.getByText(portalText.statusFromSiteLine)).toBeTruthy();
    expect(
      screen.getByRole("link", { name: portalText.publicListing }),
    ).toBeTruthy();
    expect(screen.getByText("1 žival")).toBeTruthy();
  });

  it("keeps the crawl's empty state", async () => {
    signIn(CRAWLED);
    vi.mocked(fetchAnimals).mockResolvedValue([]);
    renderWorkspace();

    await waitFor(() => {
      expect(screen.getByText(portalText.emptyLead)).toBeTruthy();
    });
    expect(screen.queryByText(portalText.listingsEmptyLead)).toBeNull();
    expect(addButton()).toBeNull();
    expect(fetchListings).not.toHaveBeenCalled();
  });
});

describe("work left unsaved on an animal's own page", () => {
  const ACCOUNT = "info@zavetisce.si";

  function card(name: string): HTMLElement {
    const heading = screen.getByRole("heading", { name });
    const article = heading.closest("article");
    if (!article) throw new Error(`no card for ${name}`);
    return article;
  }

  it("is marked on the card, so the shelter can see which animal it is", async () => {
    signIn(CRAWLED);
    vi.mocked(fetchAnimals).mockResolvedValue([
      animal({ id: "ljubljana:1", name: "Rex" }),
      animal({ id: "ljubljana:2", name: "Bine" }),
    ]);
    writeDraft(ACCOUNT, "ljubljana", "ljubljana:1", { name: "Reks" });

    renderWorkspace();

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Rex" })).toBeTruthy();
    });
    expect(within(card("Rex")).getByText(portalText.draftBadge)).toBeTruthy();
    // And only on the animal it belongs to.
    expect(
      within(card("Bine")).queryByText(portalText.draftBadge),
    ).toBeNull();
  });

  it("goes with the account when it signs out", async () => {
    signIn(CRAWLED);
    vi.mocked(fetchAnimals).mockResolvedValue([
      animal({ id: "ljubljana:1", name: "Rex" }),
    ]);
    writeDraft(ACCOUNT, "ljubljana", "ljubljana:1", { name: "Reks" });

    renderWorkspace();
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Rex" })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: portalText.logout }));

    // The next account to sign in to this tab must not inherit a stranger's
    // half-written edits.
    expect(window.sessionStorage.length).toBe(0);
  });
});

describe("a save that the current filter hides", () => {
  function statusButton(name: string, label: string): HTMLElement {
    const article = screen.getByRole("heading", { name }).closest("article");
    if (!article) throw new Error(`no card for ${name}`);
    return within(
      within(article as HTMLElement).getByRole("group", {
        name: portalText.statusLegend,
      }),
    ).getByRole("button", { name: label });
  }

  async function listOf() {
    signIn(CRAWLED);
    vi.mocked(fetchAnimals).mockResolvedValue([
      animal({ id: "ljubljana:1", name: "Rex" }),
      animal({ id: "ljubljana:2", name: "Bine" }),
      animal({ id: "ljubljana:3", name: "Muc", status: "adopted" }),
    ]);
    renderWorkspace();
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Rex" })).toBeTruthy();
    });
  }

  it("names the animal and offers the whole list back", async () => {
    await listOf();
    vi.mocked(saveAnimal).mockResolvedValue(
      animal({
        id: "ljubljana:1",
        name: "Rex",
        status: "adopted",
        overrides: { status: "adopted" },
      }),
    );

    // Looking at the animals that are still on offer, the shelter marks one
    // of them adopted. It leaves the list under the hand that saved it.
    fireEvent.click(
      within(
        screen.getByRole("group", { name: portalText.filterLegend }),
      ).getByRole("button", { name: /Na voljo/ }),
    );
    fireEvent.click(statusButton("Rex", "Oddan"));

    await waitFor(() => {
      expect(
        screen.getByText(fill(portalText.savedHidden, { name: "Rex" })),
      ).toBeTruthy();
    });
    expect(screen.queryByRole("heading", { name: "Rex" })).toBeNull();

    // Pokaži vse drops the filter and the card is back.
    fireEvent.click(screen.getByRole("button", { name: portalText.showAll }));

    expect(screen.getByRole("heading", { name: "Rex" })).toBeTruthy();
    expect(
      screen.queryByText(fill(portalText.savedHidden, { name: "Rex" })),
    ).toBeNull();
  });

  it("says nothing when the animal is still on the page", async () => {
    await listOf();
    vi.mocked(saveAnimal).mockResolvedValue(
      animal({
        id: "ljubljana:1",
        name: "Rex",
        status: "reserved",
        overrides: { status: "reserved" },
      }),
    );

    fireEvent.click(statusButton("Rex", "Rezerviran"));

    await waitFor(() => {
      expect(screen.getByText(portalText.statusOwnLine)).toBeTruthy();
    });
    expect(screen.queryByText(/trenutni filter skrije/)).toBeNull();
  });

  it("is dropped again as soon as the shelter searches for something else", async () => {
    await listOf();
    vi.mocked(saveAnimal).mockResolvedValue(
      animal({
        id: "ljubljana:1",
        name: "Rex",
        status: "adopted",
        overrides: { status: "adopted" },
      }),
    );
    fireEvent.click(
      within(
        screen.getByRole("group", { name: portalText.filterLegend }),
      ).getByRole("button", { name: /Na voljo/ }),
    );
    fireEvent.click(statusButton("Rex", "Oddan"));
    await waitFor(() => {
      expect(
        screen.getByText(fill(portalText.savedHidden, { name: "Rex" })),
      ).toBeTruthy();
    });

    fireEvent.change(screen.getByLabelText(portalText.searchLabel), {
      target: { value: "bin" },
    });

    expect(screen.queryByText(/trenutni filter skrije/)).toBeNull();
  });
});
