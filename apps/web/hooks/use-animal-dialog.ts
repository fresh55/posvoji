"use client";

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import type { Animal } from "@posvoji/schema";
import { useI18n } from "@/components/i18n-provider";
import {
  animalPath,
  animalSlugFromPath,
  findAnimalBySlug,
} from "@/lib/animal-path";
import {
  commitLocation,
  getLocationSnapshot,
  getServerLocationSnapshot,
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

function currentQuery(): string {
  return window.location.search.replace(/^\?/, "");
}

export function useAnimalDialog({
  animals,
  basePath,
}: {
  /** The list the dialog reads from, and what a path is resolved against. */
  animals: Animal[];
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

  // Having opened it, the address bar is corrected to the animal's own page,
  // so the link shared on from here is the one search engines are told is
  // canonical. Replacing rather than pushing keeps the back button pointing
  // wherever the visitor came from.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const aliased = params.get("zival");
    if (!aliased) return;
    const animal = animals.find((candidate) => candidate.id === aliased);
    // An id no animal answers to is left alone; the list strips it instead.
    if (!animal) return;
    params.delete("zival");
    commitLocation(animalPath(animal, locale), params.toString(), "replace");
  }, [animals, locale, location]);

  const open = useCallback(
    (id: string) => {
      const animal = animals.find((candidate) => candidate.id === id);
      if (!animal) return;
      commitLocation(
        animalPath(animal, locale),
        currentQuery(),
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
      commitLocation(animalPath(animal, locale), currentQuery(), "replace");
    },
    [animals, locale],
  );

  // Pushed opens get a real history entry so the back button (and this close
  // button) can pop it; deep links have nothing to pop back to, so they go to
  // the list in place instead.
  const close = useCallback(() => {
    if (window.history.state?.animal) {
      history.back();
      return;
    }
    const params = new URLSearchParams(window.location.search);
    params.delete("zival");
    commitLocation(basePath, params.toString(), "replace");
  }, [basePath]);

  return { openId, open, swap, close };
}
