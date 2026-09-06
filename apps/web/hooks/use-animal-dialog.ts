"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from "react";
import type { AnimalFields } from "@/lib/animal";
import { useI18n } from "@/components/i18n-provider";
import {
  animalPath,
  animalSlugFromPath,
  findAnimalBySlug,
  PHOTO_PARAM,
} from "@/lib/animal-path";
import {
  commitLocation,
  getLocationSnapshot,
  getServerLocationSnapshot,
  mergeOwnedParams,
  subscribeToLocation,
} from "@/lib/location-search";

// The open animal is an address, not a parameter: the dialog writes the
// animal's own page path, so what a visitor shares out of the list is the
// same URL a search engine indexes and a cold load renders on its own.
// Reuses the filters' store, whose server snapshot is "", so there is no
// hydration mismatch under static export, and history writes notify
// subscribers through commitLocation.

/** Marks the entries this hook pushed, so closing knows it can pop one. */
const PUSHED_BY_DIALOG = { animal: true };

function splitLocation(location: string): [string, string] {
  const mark = location.indexOf("?");
  if (mark === -1) return [location, ""];
  return [location.slice(0, mark), location.slice(mark + 1)];
}

// The rest of the query, which is where the filters live, without the photo.
//
// ?foto= names a photo of one animal, so it cannot travel with the visitor:
// stepping to the next animal, or clicking another card while a deep link is
// open, would otherwise open that animal on its third picture. The ?zival=
// rewrite is the one place it survives, because that is the same animal
// arriving at its own address.
//
// mergeOwnedParams rather than URLSearchParams: it keeps every param it does
// not own as the exact bytes it already is, and a filter value is not this
// hook's to re-encode.
function queryWithout(...params: string[]): string {
  return mergeOwnedParams(window.location.search, params, "");
}

export function useAnimalDialog({
  animals,
  basePath,
}: {
  /** The list the dialog reads from, and what a path is resolved against. */
  animals: AnimalFields[];
  /** The list's own address, and where closing the dialog returns to. */
  basePath: string;
}) {
  const { locale } = useI18n();
  const location = useSyncExternalStore(
    subscribeToLocation,
    getLocationSnapshot,
    getServerLocationSnapshot,
  );

  const openId = useMemo(() => {
    const [pathname, query] = splitLocation(location);
    const slug = animalSlugFromPath(pathname);
    if (slug) return findAnimalBySlug(animals, slug)?.id ?? null;
    // ?zival= is the address the dialog wrote before every animal had a page
    // of its own. Those links are out in the world, so the parameter still
    // opens the animal it names.
    return new URLSearchParams(query).get("zival");
  }, [animals, location]);

  // A dialog reached by address rather than by a card click stands on an
  // entry nothing pushed: an old ?zival= link, or the animal's own path with
  // the list mounted under it. Closing one of those used to mean different
  // things on different layouts, and a phone's back gesture left the site.
  // The entry is rewritten into the two a card click makes, the list under
  // the animal, so back closes and close pops whatever the layout, and
  // nothing is left behind for the next back to reopen.
  //
  // The list entry is written with the bare API rather than commitLocation,
  // so no subscriber sees the dialog closed between the two writes: the push
  // right after it is the one that notifies, and by then the address is the
  // animal's again, now its own page rather than the alias.
  useEffect(() => {
    if (!openId || window.history.state?.animal) return;
    const animal = animals.find((candidate) => candidate.id === openId);
    // An id no animal answers to is the host's to clean up.
    if (!animal) return;
    // Both read before anything is written, because each reads the address
    // bar. The photo stays with the animal it names and leaves the list.
    const query = queryWithout("zival");
    const list = mergeOwnedParams(query, [PHOTO_PARAM], "");
    window.history.replaceState(
      window.history.state,
      "",
      list ? `${basePath}?${list}` : basePath,
    );
    commitLocation(animalPath(animal, locale), query, "push", PUSHED_BY_DIALOG);
  }, [animals, basePath, locale, openId]);

  const open = useCallback(
    (id: string) => {
      const animal = animals.find((candidate) => candidate.id === id);
      if (!animal) return;
      commitLocation(
        animalPath(animal, locale),
        queryWithout(PHOTO_PARAM),
        "push",
        PUSHED_BY_DIALOG,
      );
    },
    [animals, locale],
  );

  // Stepping to the next animal is not a new place to come back to, so it
  // replaces the entry rather than stacking one per animal. Replacing keeps
  // the entry's state, so back still closes the dialog in one step.
  const swap = useCallback(
    (id: string) => {
      const animal = animals.find((candidate) => candidate.id === id);
      if (!animal) return;
      commitLocation(
        animalPath(animal, locale),
        queryWithout(PHOTO_PARAM),
        "replace",
      );
    },
    [animals, locale],
  );

  // Whether a pop is already on its way. Between history.back() and the
  // popstate it lands with, the dialog is still on screen and its address is
  // still the animal's, so a second close in that window, a doubled Escape,
  // would pop again and walk past the list. Cleared once the address moves.
  const popping = useRef(false);
  useEffect(() => {
    popping.current = false;
  }, [location]);

  // Pushed opens get a real history entry so the back button (and this close
  // button) can pop it. An id no animal answers to never got one and goes to
  // the list in place instead.
  const close = useCallback(() => {
    if (popping.current) return;
    if (window.history.state?.animal) {
      popping.current = true;
      history.back();
      return;
    }
    // Both of the dialog's own params go back with it: the list behind it has
    // no animal open and so has no photo on show either.
    commitLocation(basePath, queryWithout("zival", PHOTO_PARAM), "replace");
  }, [basePath]);

  return { openId, open, swap, close };
}
