// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { portalText } from "@/components/portal/portal-text";
import { NEW_LISTING, usePortalListings } from "@/hooks/use-portal-listings";
import {
  PortalError,
  archiveListing,
  createListing,
  deleteListingPhoto,
  fetchListings,
  updateListing,
  uploadListingPhoto,
  type PortalListing,
  type PortalListingInput,
} from "@/lib/portal-api";

// Only the listing routes are stubbed; PortalError and isUnauthorized stay
// the real ones, because the hook branches on them.
vi.mock("@/lib/portal-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/portal-api")>()),
  fetchListings: vi.fn(),
  createListing: vi.fn(),
  updateListing: vi.fn(),
  archiveListing: vi.fn(),
  uploadListingPhoto: vi.fn(),
  deleteListingPhoto: vi.fn(),
}));

afterEach(cleanup);

beforeEach(() => {
  vi.mocked(fetchListings).mockReset();
  vi.mocked(createListing).mockReset();
  vi.mocked(updateListing).mockReset();
  vi.mocked(archiveListing).mockReset();
  vi.mocked(uploadListingPhoto).mockReset();
  vi.mocked(deleteListingPhoto).mockReset();
});

function listing(overrides: Partial<PortalListing> = {}): PortalListing {
  return {
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
    ...overrides,
  };
}

const INPUT: PortalListingInput = {
  species: "cat",
  name: "Luna",
  status: "available",
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
};

const PHOTO = {
  id: 7,
  url: "http://localhost:8000/media/listings/6d1c/3f2a9c.jpg",
  width: 1600,
  height: 1200,
};

/** Renders the hook over a loaded list. */
async function load(list: PortalListing[]) {
  vi.mocked(fetchListings).mockResolvedValue(list);
  const onUnauthorized = vi.fn();
  const hook = renderHook(() => usePortalListings("johanca", onUnauthorized));
  await waitFor(() => {
    expect(hook.result.current.state.status).toBe("ready");
  });
  return { ...hook, onUnauthorized };
}

describe("loading", () => {
  it("asks for the shelter's listings and reports them", async () => {
    const { result } = await load([listing()]);

    expect(fetchListings).toHaveBeenCalledWith("johanca");
    expect(result.current.listings).toEqual([listing()]);
  });

  it("stays idle with no shelter to load", () => {
    const { result } = renderHook(() => usePortalListings(null, vi.fn()));

    expect(fetchListings).not.toHaveBeenCalled();
    expect(result.current.state.status).toBe("loading");
  });

  it("names a failed load in the shelter's terms", async () => {
    vi.mocked(fetchListings).mockRejectedValue(new PortalError(0));
    const { result } = renderHook(() => usePortalListings("johanca", vi.fn()));

    await waitFor(() => {
      expect(result.current.state).toEqual({
        status: "error",
        message: portalText.networkError,
      });
    });
  });

  it("bounces a session the API no longer accepts", async () => {
    vi.mocked(fetchListings).mockRejectedValue(new PortalError(401));
    const onUnauthorized = vi.fn();
    renderHook(() => usePortalListings("johanca", onUnauthorized));

    await waitFor(() => expect(onUnauthorized).toHaveBeenCalled());
  });
});

describe("creating", () => {
  it("puts the new listing where the API would list it, by name", async () => {
    const ana = listing({ id: "a", name: "Ana" });
    const ciril = listing({ id: "c", name: "Ciril" });
    const bine = listing({ id: "b", name: "bine" });
    vi.mocked(createListing).mockResolvedValue(bine);
    const { result } = await load([ana, ciril]);

    let saved: PortalListing | null = null;
    await act(async () => {
      saved = await result.current.actions.create({ ...INPUT, name: "bine" });
    });

    expect(saved).toEqual(bine);
    expect(createListing).toHaveBeenCalledWith("johanca", {
      ...INPUT,
      name: "bine",
    });
    // Case folded, as the route sorts: "bine" lands between Ana and Ciril.
    expect(result.current.listings.map((item) => item.name)).toEqual([
      "Ana",
      "bine",
      "Ciril",
    ]);
    expect(result.current.saveStates[NEW_LISTING]).toEqual({
      status: "saved",
    });
  });

  it("reports a refused create in the new listing's own slot", async () => {
    vi.mocked(createListing).mockRejectedValue(new PortalError(422, "no"));
    const { result } = await load([]);

    let saved: PortalListing | null = listing();
    await act(async () => {
      saved = await result.current.actions.create(INPUT);
    });

    expect(saved).toBeNull();
    expect(result.current.listings).toEqual([]);
    expect(result.current.saveStates[NEW_LISTING]).toEqual({
      status: "error",
      message: portalText.invalidError,
    });
  });

  it("bounces a create the session no longer covers", async () => {
    vi.mocked(createListing).mockRejectedValue(new PortalError(401));
    const { result, onUnauthorized } = await load([]);

    await act(async () => {
      await result.current.actions.create(INPUT);
    });

    expect(onUnauthorized).toHaveBeenCalled();
    // No message: the page is on its way to the login, not to an error.
    expect(result.current.saveStates[NEW_LISTING]?.status).not.toBe("error");
  });
});

describe("updating", () => {
  it("replaces the listing in place with what the server stored", async () => {
    const before = listing();
    const after = listing({ status: "reserved", name: "Lunica" });
    vi.mocked(updateListing).mockResolvedValue(after);
    const { result } = await load([listing({ id: "a", name: "Ana" }), before]);

    await act(async () => {
      await result.current.actions.update(before.id, {
        ...INPUT,
        status: "reserved",
      });
    });

    expect(updateListing).toHaveBeenCalledWith("johanca", before.id, {
      ...INPUT,
      status: "reserved",
    });
    // Second, where it was: a rename does not move the card under the hand.
    expect(result.current.listings.map((item) => item.name)).toEqual([
      "Ana",
      "Lunica",
    ]);
    expect(result.current.saveStates[before.id]).toEqual({ status: "saved" });
  });
});

describe("archiving", () => {
  it("takes the listing off the list and forgets its slot", async () => {
    vi.mocked(archiveListing).mockResolvedValue(undefined);
    const gone = listing();
    const { result } = await load([gone, listing({ id: "a", name: "Ana" })]);

    let done = false;
    await act(async () => {
      done = await result.current.actions.archive(gone.id);
    });

    expect(done).toBe(true);
    expect(archiveListing).toHaveBeenCalledWith("johanca", gone.id);
    expect(result.current.listings.map((item) => item.id)).toEqual(["a"]);
    expect(result.current.saveStates[gone.id]).toBeUndefined();
  });

  it("keeps the listing and says so when the archive fails", async () => {
    vi.mocked(archiveListing).mockRejectedValue(new PortalError(500));
    const kept = listing();
    const { result } = await load([kept]);

    let done = true;
    await act(async () => {
      done = await result.current.actions.archive(kept.id);
    });

    expect(done).toBe(false);
    expect(result.current.listings).toEqual([kept]);
    expect(result.current.saveStates[kept.id]).toEqual({
      status: "error",
      message: portalText.listingArchiveError,
    });
  });
});

describe("photos", () => {
  const file = new File(["jpeg bytes"], "luna.jpg", { type: "image/jpeg" });

  it("appends the stored copy the upload answers with", async () => {
    vi.mocked(uploadListingPhoto).mockResolvedValue(PHOTO);
    const subject = listing({ photos: [{ ...PHOTO, id: 3 }] });
    const { result } = await load([subject]);

    await act(async () => {
      await result.current.actions.uploadPhoto(subject.id, file);
    });

    expect(uploadListingPhoto).toHaveBeenCalledWith("johanca", subject.id, file);
    expect(result.current.listings[0].photos.map((photo) => photo.id)).toEqual([
      3, 7,
    ]);
    expect(result.current.saveStates[subject.id]).toEqual({ status: "saved" });
  });

  it("keeps one copy when the upload answers with a photo already there", async () => {
    vi.mocked(uploadListingPhoto).mockResolvedValue(PHOTO);
    const subject = listing({ photos: [PHOTO] });
    const { result } = await load([subject]);

    await act(async () => {
      await result.current.actions.uploadPhoto(subject.id, file);
    });

    expect(result.current.listings[0].photos).toEqual([PHOTO]);
  });

  it("answers null and says so when the upload fails", async () => {
    vi.mocked(uploadListingPhoto).mockRejectedValue(new PortalError(413));
    const subject = listing();
    const { result } = await load([subject]);

    let photo = PHOTO;
    await act(async () => {
      photo = (await result.current.actions.uploadPhoto(subject.id, file))!;
    });

    expect(photo).toBeNull();
    expect(result.current.saveStates[subject.id]).toEqual({
      status: "error",
      message: portalText.photoUploadError,
    });
  });

  it("drops a removed photo from the listing", async () => {
    vi.mocked(deleteListingPhoto).mockResolvedValue(undefined);
    const subject = listing({ photos: [PHOTO, { ...PHOTO, id: 8 }] });
    const { result } = await load([subject]);

    await act(async () => {
      await result.current.actions.deletePhoto(subject.id, 7);
    });

    expect(deleteListingPhoto).toHaveBeenCalledWith("johanca", subject.id, 7);
    expect(result.current.listings[0].photos.map((photo) => photo.id)).toEqual([
      8,
    ]);
  });
});
