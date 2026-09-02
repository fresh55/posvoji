"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { portalText } from "@/components/portal/portal-text";
import {
  IDLE,
  SAVED_FLASH_MS,
  message,
  type PortalListState,
  type PortalSaveState,
} from "@/hooks/portal-list";
import {
  archiveListing,
  createListing,
  deleteListingPhoto,
  fetchListings,
  isUnauthorized,
  updateListing,
  uploadListingPhoto,
  type PortalListing,
  type PortalListingInput,
  type PortalListingPhoto,
} from "@/lib/portal-api";

/**
 * The save slot a listing that does not exist yet writes to. A listing id is
 * a uuid, so nothing can collide with it.
 */
export const NEW_LISTING = "new";

/**
 * Whether `listing` sorts after `added`, by the listing route's own key: the
 * name folded to one case, then the id to break a tie. toLowerCase stands in
 * for Python's casefold, which agree on everything Slovenian, and both sides
 * then compare by code point.
 */
function sortsAfter(listing: PortalListing, added: PortalListing): boolean {
  const left = listing.name.toLowerCase();
  const right = added.name.toLowerCase();
  if (left !== right) return left > right;
  return listing.id > added.id;
}

/** Puts a new listing where the API would have put it, without a reload. */
function insertByName(
  listings: PortalListing[],
  added: PortalListing,
): PortalListing[] {
  const index = listings.findIndex((listing) => sortsAfter(listing, added));
  if (index === -1) return [...listings, added];
  return [...listings.slice(0, index), added, ...listings.slice(index)];
}

/** The stored photo appended to a listing, unless the listing already has it. */
function withPhoto(
  listing: PortalListing,
  photo: PortalListingPhoto,
): PortalListing {
  // A byte-identical upload answers 200 with the row that is already on the
  // listing, so there is nothing to replace: the id is already there and the
  // listing stands. Position is the API's, and it appends, so a photo that is
  // new goes last.
  if (listing.photos.some((existing) => existing.id === photo.id))
    return listing;
  return { ...listing, photos: [...listing.photos, photo] };
}

export type PortalListingActions = {
  create: (input: PortalListingInput) => Promise<PortalListing | null>;
  update: (
    listingId: string,
    input: PortalListingInput,
  ) => Promise<PortalListing | null>;
  archive: (listingId: string) => Promise<boolean>;
  uploadPhoto: (
    listingId: string,
    file: File,
  ) => Promise<PortalListingPhoto | null>;
  deletePhoto: (listingId: string, photoId: number) => Promise<boolean>;
};

/**
 * The listings a manual shelter writes here, plus a per-listing save state.
 *
 * Modelled on usePortalAnimals and saving the same way: never optimistic. The
 * POST and the PUT answer with the whole listing, so the card is replaced
 * with what the server stored rather than with a guess, and a photo route
 * answers with the stored copy's own size.
 */
export function usePortalListings(
  slug: string | null,
  onUnauthorized: () => void,
): {
  listings: PortalListing[];
  state: PortalListState;
  saveStates: Record<string, PortalSaveState>;
  reload: () => void;
  actions: PortalListingActions;
} {
  const [listings, setListings] = useState<PortalListing[]>([]);
  const [state, setState] = useState<PortalListState>({ status: "loading" });
  const [saveStates, setSaveStates] = useState<Record<string, PortalSaveState>>(
    {},
  );
  const [attempt, setAttempt] = useState(0);
  const timers = useRef(new Map<string, number>());
  // Kept in a ref so the actions do not have to be rebuilt on every redirect
  // callback identity change.
  const unauthorized = useRef(onUnauthorized);
  unauthorized.current = onUnauthorized;

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending.values()) window.clearTimeout(timer);
      pending.clear();
    };
  }, []);

  useEffect(() => {
    if (!slug) return;
    let live = true;
    setState({ status: "loading" });
    setSaveStates({});

    fetchListings(slug).then(
      (list) => {
        if (!live) return;
        setListings(list);
        setState({ status: "ready" });
      },
      (error: unknown) => {
        if (!live) return;
        if (isUnauthorized(error)) {
          unauthorized.current();
          return;
        }
        setListings([]);
        setState({
          status: "error",
          message: message(error, portalText.listError),
        });
      },
    );

    return () => {
      live = false;
    };
  }, [slug, attempt]);

  const reload = useCallback(() => setAttempt((count) => count + 1), []);

  const flashSaved = useCallback((key: string) => {
    const previous = timers.current.get(key);
    if (previous) window.clearTimeout(previous);
    timers.current.set(
      key,
      window.setTimeout(() => {
        timers.current.delete(key);
        setSaveStates((current) => ({ ...current, [key]: IDLE }));
      }, SAVED_FLASH_MS),
    );
  }, []);

  const begin = useCallback((key: string) => {
    setSaveStates((current) => ({ ...current, [key]: { status: "saving" } }));
  }, []);

  const succeed = useCallback(
    (key: string) => {
      setSaveStates((current) => ({ ...current, [key]: { status: "saved" } }));
      flashSaved(key);
    },
    [flashSaved],
  );

  const fail = useCallback(
    (key: string, error: unknown, fallback: string) => {
      if (isUnauthorized(error)) {
        unauthorized.current();
        return;
      }
      setSaveStates((current) => ({
        ...current,
        [key]: { status: "error", message: message(error, fallback) },
      }));
    },
    [],
  );

  const create = useCallback(
    async (input: PortalListingInput): Promise<PortalListing | null> => {
      if (!slug) return null;
      begin(NEW_LISTING);
      try {
        const saved = await createListing(slug, input);
        setListings((current) => insertByName(current, saved));
        succeed(NEW_LISTING);
        return saved;
      } catch (error) {
        fail(NEW_LISTING, error, portalText.saveError);
        return null;
      }
    },
    [begin, fail, slug, succeed],
  );

  const update = useCallback(
    async (
      listingId: string,
      input: PortalListingInput,
    ): Promise<PortalListing | null> => {
      if (!slug) return null;
      begin(listingId);
      try {
        const saved = await updateListing(slug, listingId, input);
        // Replaced in place even when the name changed: re-sorting here would
        // move the card out from under the hand that just tapped it.
        setListings((current) =>
          current.map((listing) => (listing.id === saved.id ? saved : listing)),
        );
        succeed(listingId);
        return saved;
      } catch (error) {
        fail(listingId, error, portalText.saveError);
        return null;
      }
    },
    [begin, fail, slug, succeed],
  );

  const archive = useCallback(
    async (listingId: string): Promise<boolean> => {
      if (!slug) return false;
      begin(listingId);
      try {
        await archiveListing(slug, listingId);
        setListings((current) =>
          current.filter((listing) => listing.id !== listingId),
        );
        // The card is gone, so its slot has nothing left to report. Left
        // behind it would greet the next listing minted with that key, and
        // the flash timer would fire into a state nothing reads.
        const timer = timers.current.get(listingId);
        if (timer) {
          window.clearTimeout(timer);
          timers.current.delete(listingId);
        }
        setSaveStates((current) => {
          const { [listingId]: gone, ...rest } = current;
          void gone;
          return rest;
        });
        return true;
      } catch (error) {
        fail(listingId, error, portalText.listingArchiveError);
        return false;
      }
    },
    [begin, fail, slug],
  );

  const uploadPhoto = useCallback(
    async (
      listingId: string,
      file: File,
    ): Promise<PortalListingPhoto | null> => {
      if (!slug) return null;
      begin(listingId);
      try {
        const photo = await uploadListingPhoto(slug, listingId, file);
        setListings((current) =>
          current.map((listing) =>
            listing.id === listingId ? withPhoto(listing, photo) : listing,
          ),
        );
        succeed(listingId);
        return photo;
      } catch (error) {
        fail(listingId, error, portalText.photoUploadError);
        return null;
      }
    },
    [begin, fail, slug, succeed],
  );

  const deletePhoto = useCallback(
    async (listingId: string, photoId: number): Promise<boolean> => {
      if (!slug) return false;
      begin(listingId);
      try {
        await deleteListingPhoto(slug, listingId, photoId);
        setListings((current) =>
          current.map((listing) =>
            listing.id === listingId
              ? {
                  ...listing,
                  photos: listing.photos.filter(
                    (photo) => photo.id !== photoId,
                  ),
                }
              : listing,
          ),
        );
        succeed(listingId);
        return true;
      } catch (error) {
        fail(listingId, error, portalText.photoRemoveError);
        return false;
      }
    },
    [begin, fail, slug, succeed],
  );

  // One object, so a card or the form can take the whole bundle and the
  // identity only changes when the slug does.
  const actions = useMemo<PortalListingActions>(
    () => ({ create, update, archive, uploadPhoto, deletePhoto }),
    [archive, create, deletePhoto, update, uploadPhoto],
  );

  return { listings, state, saveStates, reload, actions };
}
