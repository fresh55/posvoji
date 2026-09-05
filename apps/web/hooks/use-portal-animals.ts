"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  hasUnconfirmedStatus,
  statusOf,
} from "@/components/portal/animal-meta";
import { portalText } from "@/components/portal/portal-text";
import {
  IDLE,
  SAVED_FLASH_MS,
  message,
  type PortalListState,
  type PortalSaveState,
} from "@/hooks/portal-list";
import {
  fetchAnimals,
  isUnauthorized,
  saveAnimal,
  type PortalAnimal,
  type PortalAnimalPatch,
  type PortalStatus,
} from "@/lib/portal-api";

/**
 * Confirming every unconfirmed status at once, as the banner above the list
 * reports it. "done" and "failed" both carry the total, because the sentence
 * they are drawn as says how much work the shelter just had done for them.
 */
export type PortalBulkState =
  | { status: "idle" }
  | { status: "running"; done: number; total: number }
  | { status: "done"; total: number }
  | { status: "failed"; failed: number; total: number };

/**
 * How many confirmations are in flight at once. There is no bulk route on the
 * API, so a shelter with 150 unconfirmed statuses means 150 PUTs. One at a
 * time, on purpose: the API writes to SQLite, and on 2026-09-06 three at a
 * time made 39 of 185 PUTs fail with "database is locked". A run of 186 takes
 * about ten seconds this way, and the banner counts them up as they land.
 */
const CONFIRM_CONCURRENCY = 1;

/** What one PUT settled as. A 401 is neither: nothing was stored and nothing
 *  more can be, so it is the caller who decides what happens next. */
type SaveOutcome = "saved" | "failed" | "unauthorized";

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
  confirmStatuses: (animalIds: string[]) => Promise<void>;
  bulk: PortalBulkState;
  publicName: (animal: PortalAnimal) => string | null;
} {
  const [animals, setAnimals] = useState<PortalAnimal[]>([]);
  const [state, setState] = useState<PortalListState>({ status: "loading" });
  // The name every animal carried when this list arrived. A save replaces the
  // animal but never this, so it stays the name from before the edit.
  const [listedNames, setListedNames] = useState<
    ReadonlyMap<string, string | null>
  >(new Map());
  const [saveStates, setSaveStates] = useState<Record<string, PortalSaveState>>(
    {},
  );
  const [bulk, setBulk] = useState<PortalBulkState>({ status: "idle" });
  const [attempt, setAttempt] = useState(0);
  const timers = useRef(new Map<string, number>());
  const bulkTimer = useRef<number | null>(null);
  // One run at a time, read synchronously: a second tap on "Potrdi vse"
  // arrives long before any state from the first has rendered.
  const confirming = useRef(false);
  // The list as it is right now, for a caller that hands us ids and expects us
  // to know what each animal's status currently says.
  const latest = useRef(animals);
  latest.current = animals;
  // Kept in a ref so save() does not have to be rebuilt on every redirect
  // callback identity change.
  const unauthorized = useRef(onUnauthorized);
  unauthorized.current = onUnauthorized;

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending.values()) window.clearTimeout(timer);
      pending.clear();
      if (bulkTimer.current) window.clearTimeout(bulkTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!slug) return;
    let live = true;
    setState({ status: "loading" });
    setSaveStates({});
    // A run belongs to the list it was started over. A new list, whether
    // another shelter's or this one reloaded, answers for itself.
    if (bulkTimer.current) {
      window.clearTimeout(bulkTimer.current);
      bulkTimer.current = null;
    }
    setBulk({ status: "idle" });

    fetchAnimals(slug).then(
      (list) => {
        if (!live) return;
        setAnimals(list);
        setListedNames(new Map(list.map((animal) => [animal.id, animal.name])));
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

  /**
   * One PUT and everything it leaves behind on the animal it went to: the
   * saving and saved flashes, and the record the server merged. It says what
   * happened rather than acting on a 401 itself, because a run of these has
   * to redirect once, not once per request still in flight.
   */
  const runSave = useCallback(
    async (
      animalId: string,
      patch: PortalAnimalPatch,
    ): Promise<SaveOutcome> => {
      if (!slug) return "failed";
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
        return "saved";
      } catch (error) {
        if (isUnauthorized(error)) return "unauthorized";
        setSaveStates((current) => ({
          ...current,
          [animalId]: {
            status: "error",
            message: message(error, portalText.saveError),
          },
        }));
        return "failed";
      }
    },
    [flashSaved, slug],
  );

  const save = useCallback(
    async (animalId: string, patch: PortalAnimalPatch): Promise<boolean> => {
      const outcome = await runSave(animalId, patch);
      if (outcome === "unauthorized") {
        unauthorized.current();
        return false;
      }
      return outcome === "saved";
    },
    [runSave],
  );

  /**
   * Making the crawl's reading of the status the shelter's own answer, for a
   * whole list at once. There is no bulk route, so each animal gets the PUT it
   * would have got from its own row, with the value it already shows: the
   * point of confirming is that the value does not change, only whose answer
   * it is. Each row therefore flashes its own saving and saved, and the list
   * is replaced from each response, exactly as a single tap would leave it.
   *
   * An id whose status the shelter has already answered for is skipped rather
   * than re-sent, so a stale banner count cannot overwrite an edit.
   */
  const confirmStatuses = useCallback(
    async (animalIds: string[]): Promise<void> => {
      if (confirming.current) return;

      const known = new Map(
        latest.current.map((animal) => [animal.id, animal] as const),
      );
      const pending: { id: string; status: PortalStatus }[] = [];
      for (const id of animalIds) {
        const animal = known.get(id);
        if (!animal || !hasUnconfirmedStatus(animal)) continue;
        const { status } = statusOf(animal);
        if (status) pending.push({ id: animal.id, status });
      }

      if (bulkTimer.current) {
        window.clearTimeout(bulkTimer.current);
        bulkTimer.current = null;
      }
      if (pending.length === 0) {
        setBulk({ status: "idle" });
        return;
      }

      confirming.current = true;
      const total = pending.length;
      setBulk({ status: "running", done: 0, total });

      let settled = 0;
      let failed = 0;
      let gone = false;
      let next = 0;

      const worker = async (): Promise<void> => {
        while (!gone) {
          const index = next++;
          if (index >= total) return;
          const animal = pending[index];
          const outcome = await runSave(animal.id, { status: animal.status });
          // The session is over. Whatever is still queued would only fail the
          // same way, and the page is about to be replaced anyway.
          if (outcome === "unauthorized") {
            gone = true;
            return;
          }
          if (outcome === "failed") failed += 1;
          settled += 1;
          setBulk({ status: "running", done: settled, total });
        }
      };

      await Promise.all(
        Array.from({ length: Math.min(CONFIRM_CONCURRENCY, total) }, () =>
          worker(),
        ),
      );
      confirming.current = false;

      if (gone) {
        setBulk({ status: "idle" });
        unauthorized.current();
        return;
      }
      if (failed > 0) {
        // Left standing: the banner is the only place that says some of it did
        // not go through, and it carries the retry.
        setBulk({ status: "failed", failed, total });
        return;
      }
      setBulk({ status: "done", total });
      // Long enough to be read after the last row's own "Shranjeno" has gone,
      // then the banner has nothing left to say and there is nothing left to
      // confirm.
      bulkTimer.current = window.setTimeout(() => {
        bulkTimer.current = null;
        setBulk({ status: "idle" });
      }, SAVED_FLASH_MS * 2);
    },
    [runSave],
  );

  /**
   * The name to build this animal's public address from.
   *
   * The public site is a static export rebuilt about every twelve hours, and
   * its animal pages exist only for the slugs that build read, so the address
   * an animal has right now is the one its name had then. The API sends one
   * merged name and no published one, so the closest reading we have is the
   * name the list loaded with: it is never ahead of a rename saved here, which
   * is the case that would otherwise link to a page that does not exist yet.
   * An animal the list has not seen falls back to its own name.
   */
  const publicName = useCallback(
    (animal: PortalAnimal): string | null => {
      const listed = listedNames.get(animal.id);
      return listed === undefined ? animal.name : listed;
    },
    [listedNames],
  );

  return {
    animals,
    state,
    saveStates,
    reload,
    save,
    confirmStatuses,
    bulk,
    publicName,
  };
}
