"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { portalText } from "@/components/portal/portal-text";
import {
  PortalError,
  fetchAnimals,
  isUnauthorized,
  saveAnimal,
  type PortalAnimal,
  type PortalAnimalPatch,
  type PortalErrorKind,
} from "@/lib/portal-api";

const SAVED_FLASH_MS = 1800;

export type PortalListState =
  | { status: "loading" }
  | { status: "ready" }
  | { status: "error"; message: string };

export type PortalSaveState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "saved" }
  | { status: "error"; message: string };

const IDLE: PortalSaveState = { status: "idle" };

// What each failure says to a shelter. A kind that is not here says only
// what the caller was doing, which is all a server fault can honestly say.
const MESSAGES: Partial<Record<PortalErrorKind, string>> = {
  forbidden: portalText.forbidden,
  network: portalText.networkError,
  invalid: portalText.invalidError,
};

function message(error: unknown, fallback: string): string {
  if (error instanceof PortalError) {
    const known = MESSAGES[error.kind];
    if (known) return known;
  }
  return fallback;
}

/**
 * The shelter's animals plus a per-animal save state. Saving is not
 * optimistic: the PUT answers with the merged animal, so the card is replaced
 * with what the server actually stored rather than with a guess.
 */
export function usePortalAnimals(
  slug: string | null,
  onUnauthorized: () => void,
): {
  animals: PortalAnimal[];
  state: PortalListState;
  saveStates: Record<string, PortalSaveState>;
  reload: () => void;
  save: (animalId: string, patch: PortalAnimalPatch) => Promise<boolean>;
} {
  const [animals, setAnimals] = useState<PortalAnimal[]>([]);
  const [state, setState] = useState<PortalListState>({ status: "loading" });
  const [saveStates, setSaveStates] = useState<Record<string, PortalSaveState>>(
    {},
  );
  const [attempt, setAttempt] = useState(0);
  const timers = useRef(new Map<string, number>());
  // Kept in a ref so save() does not have to be rebuilt on every redirect
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

    fetchAnimals(slug).then(
      (list) => {
        if (!live) return;
        setAnimals(list);
        setState({ status: "ready" });
      },
      (error: unknown) => {
        if (!live) return;
        if (isUnauthorized(error)) {
          unauthorized.current();
          return;
        }
        setAnimals([]);
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

  const flashSaved = useCallback((animalId: string) => {
    const previous = timers.current.get(animalId);
    if (previous) window.clearTimeout(previous);
    timers.current.set(
      animalId,
      window.setTimeout(() => {
        timers.current.delete(animalId);
        setSaveStates((current) => ({ ...current, [animalId]: IDLE }));
      }, SAVED_FLASH_MS),
    );
  }, []);

  const save = useCallback(
    async (animalId: string, patch: PortalAnimalPatch): Promise<boolean> => {
      if (!slug) return false;
      setSaveStates((current) => ({
        ...current,
        [animalId]: { status: "saving" },
      }));

      try {
        const saved = await saveAnimal(slug, animalId, patch);
        // Replaced in place: re-sorting here would move the card out from
        // under the hand that just tapped it.
        setAnimals((current) =>
          current.map((animal) => (animal.id === saved.id ? saved : animal)),
        );
        setSaveStates((current) => ({
          ...current,
          [animalId]: { status: "saved" },
        }));
        flashSaved(animalId);
        return true;
      } catch (error) {
        if (isUnauthorized(error)) {
          unauthorized.current();
          return false;
        }
        setSaveStates((current) => ({
          ...current,
          [animalId]: {
            status: "error",
            message: message(error, portalText.saveError),
          },
        }));
        return false;
      }
    },
    [flashSaved, slug],
  );

  return { animals, state, saveStates, reload, save };
}
