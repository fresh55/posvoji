// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PortalProvider } from "@/components/portal/portal-provider";
import { PortalWorkspace } from "@/components/portal/portal-workspace";
import { portalText } from "@/components/portal/portal-text";
import {
  PortalError,
  fetchAnimals,
  fetchListings,
  fetchSession,
  type PortalAnimal,
  type PortalListing,
  type PortalShelter,
} from "@/lib/portal-api";

// Only the reads the workspace makes on its way in are stubbed; PortalError
// and isUnauthorized stay the real ones, because the hooks branch on them.
vi.mock("@/lib/portal-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/portal-api")>()),
  fetchSession: vi.fn(),
  fetchAnimals: vi.fn(),
  fetchListings: vi.fn(),
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

afterEach(cleanup);

beforeEach(() => {
  vi.mocked(fetchSession).mockReset();
  vi.mocked(fetchAnimals).mockReset();
  vi.mocked(fetchListings).mockReset();
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
