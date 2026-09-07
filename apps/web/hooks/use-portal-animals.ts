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

/** What one PUT settled as. A 401 is neither: nothing was stored and nothing
 *  more can be, so it is the caller who decides what happens next. */
type SaveOutcome = "saved" | "failed" | "unauthorized";

// One value each, so a consumer that keys a memo on the list is not woken by
// a fresh [] on every render of a shelter that has not loaded yet.
const NO_ANIMALS: PortalAnimal[] = [];
const LOADING: PortalListState = { status: "loading" };

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
  confirmStatuses: () => Promise<void>;
  bulk: PortalBulkState;
  publicName: (animal: PortalAnimal) => string | null;
} {
  const [animals, setAnimals] = useState<PortalAnimal[]>([]);
  const [state, setState] = useState<PortalListState>(LOADING);
  // The shelter the list above answered for. Compared at render time, so a
  // new slug does not have to wait for the effect below to commit: for that
  // one frame the previous shelter's list would stand as "ready" under the
  // new slug, and the editor page would read an animal that is not on it as
  // one that does not exist.
  const [listSlug, setListSlug] = useState<string | null>(null);
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
  // One run at a time, read synchronously: a second tap on "Potrdi vse"
  // arrives long before any state from the first has rendered.
  const confirming = useRef(false);
  // The animals a PUT is out for, read synchronously for the same reason: a
  // second save of the same animal must not race the first for the last
  // word on what the server stored.
  const inFlight = useRef(new Set<string>());

  const stale = slug !== null && listSlug !== slug;
  const shown = stale ? NO_ANIMALS : animals;
  const shownState = stale ? LOADING : state;

  // The list as it is right now, so a run started from a button drawn one
  // render ago still sends what each animal's status says today.
  const latest = useRef(shown);
  latest.current = shown;
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

  // A finished run has long enough to be read that the last row's own
  // "Shranjeno" has gone, and then the banner has nothing left to say. Owned
  // by an effect rather than by a timer every early return has to remember to
  // clear: leaving "done" for any reason, a new shelter and an unmount
  // included, is this effect being cleaned up.
  useEffect(() => {
    if (bulk.status !== "done") return;
    const timer = window.setTimeout(
      () => setBulk({ status: "idle" }),
      SAVED_FLASH_MS * 2,
    );
    return () => window.clearTimeout(timer);
  }, [bulk.status]);

  useEffect(() => {
    if (!slug) return;
    let live = true;
    setState({ status: "loading" });
    setSaveStates({});
    // A run belongs to the list it was started over. A new list, whether
    // another shelter's or this one reloaded, answers for itself.
    setBulk({ status: "idle" });

    fetchAnimals(slug).then(
      (list) => {
        if (!live) return;
        setAnimals(list);
        setListedNames(new Map(list.map((animal) => [animal.id, animal.name])));
        setListSlug(slug);
        setState({ status: "ready" });
      },
      (error: unknown) => {
        if (!live) return;
        if (isUnauthorized(error)) {
          unauthorized.current();
          return;
        }
        setAnimals([]);
        setListSlug(slug);
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
      inFlight.current.add(animalId);
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
        if (isUnauthorized(error)) {
          // Nothing was stored, and the row must not be left saying it is
          // still being: the redirect that follows can be slow to land, and
          // a tab the browser keeps open would show a spinner for good.
          setSaveStates((current) => ({ ...current, [animalId]: IDLE }));
          return "unauthorized";
        }
        setSaveStates((current) => ({
          ...current,
          [animalId]: {
            status: "error",
            message: message(error, portalText.saveError),
          },
        }));
        return "failed";
      } finally {
        inFlight.current.delete(animalId);
      }
    },
    [flashSaved, slug],
  );

  const save = useCallback(
    async (animalId: string, patch: PortalAnimalPatch): Promise<boolean> => {
      // The row's controls are disabled while it saves; this is the same
      // rule underneath them, for a tap that gets past the disabled state.
      // The second PUT is dropped rather than queued: it was made from a
      // record the first is about to replace.
      if (inFlight.current.has(animalId)) return false;
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
   * The set is read here rather than handed in: an animal the shelter has
   * already answered for is never resent, so a banner drawn a render ago
   * cannot write over an edit made since.
   *
   * One PUT at a time. The API writes to SQLite, and on 2026-09-06 three at a
   * time made 39 of 185 fail with "database is locked". A run of 186 takes
   * about ten seconds this way, and the banner counts them up as they land.
   */
  const confirmStatuses = useCallback(async (): Promise<void> => {
    if (confirming.current) return;

    const pending: { id: string; status: PortalStatus }[] = [];
    for (const animal of latest.current) {
      if (!hasUnconfirmedStatus(animal)) continue;
      const { status } = statusOf(animal);
      if (status) pending.push({ id: animal.id, status });
    }
    if (pending.length === 0) {
      setBulk({ status: "idle" });
      return;
    }

    confirming.current = true;
    const total = pending.length;
    setBulk({ status: "running", done: 0, total });

    let failed = 0;
    let gone = false;
    for (const [index, animal] of pending.entries()) {
      const outcome = await runSave(animal.id, { status: animal.status });
      // The session is over. Whatever is left would only fail the same way,
      // and the page is about to be replaced anyway.
      if (outcome === "unauthorized") {
        gone = true;
        break;
      }
      if (outcome === "failed") failed += 1;
      setBulk({ status: "running", done: index + 1, total });
    }
    confirming.current = false;

    if (gone) {
      setBulk({ status: "idle" });
      unauthorized.current();
      return;
    }
    // A failure is left standing: the banner is the only place that says some
    // of it did not go through, and it carries the retry.
    setBulk(
      failed > 0
        ? { status: "failed", failed, total }
        : { status: "done", total },
    );
  }, [runSave]);

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
    animals: shown,
    state: shownState,
    saveStates,
    reload,
    save,
    confirmStatuses,
    bulk,
    publicName,
  };
}
