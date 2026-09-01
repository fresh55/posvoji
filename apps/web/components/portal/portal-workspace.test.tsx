// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PortalWorkspace } from "@/components/portal/portal-workspace";
import { portalText } from "@/components/portal/portal-text";
import {
  fetchAnimals,
  fetchListings,
  fetchSession,
  type PortalAnimal,
  type PortalListing,
  type PortalShelter,
} from "@/lib/portal-api";

// Only the reads the workspace makes on its way in are stubbed.
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

const ANIMAL: PortalAnimal = {
  id: "ljubljana:1",
  species: "dog",
  status: "available",
  name: "Rex",
  breed: null,
  sex: null,
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
  thumbnailUrl: null,
  overrides: {},
};

function signIn(shelter: PortalShelter) {
  vi.mocked(fetchSession).mockResolvedValue({
    email: "info@zavetisce.si",
    shelters: [shelter],
  });
}

function addButton(): HTMLElement | null {
  return screen.queryByRole("button", { name: portalText.listingAdd });
}

describe("a shelter that writes its own listings", () => {
  it("reads listings, never animals, and offers to add the first", async () => {
    signIn(MANUAL);
    vi.mocked(fetchListings).mockResolvedValue([]);
    render(<PortalWorkspace />);

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
    render(<PortalWorkspace />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Luna" })).toBeTruthy();
    });
    expect(screen.getByText("1 žival")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: portalText.listingAdd })).toHaveLength(1);
    // A listing card, not a crawled one: nothing to confirm off a site.
    expect(screen.queryByText(portalText.statusFromSiteLine)).toBeNull();
    expect(screen.queryByRole("link", { name: portalText.publicListing })).toBeNull();
  });

  it("opens the new listing form from the header", async () => {
    signIn(MANUAL);
    vi.mocked(fetchListings).mockResolvedValue([LISTING]);
    render(<PortalWorkspace />);
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
    render(<PortalWorkspace />);
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
    vi.mocked(fetchAnimals).mockResolvedValue([ANIMAL]);
    render(<PortalWorkspace />);

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
    render(<PortalWorkspace />);

    await waitFor(() => {
      expect(screen.getByText(portalText.emptyLead)).toBeTruthy();
    });
    expect(screen.queryByText(portalText.listingsEmptyLead)).toBeNull();
    expect(addButton()).toBeNull();
    expect(fetchListings).not.toHaveBeenCalled();
  });
});
