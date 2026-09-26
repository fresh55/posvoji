"use client";

import { useRef, useState } from "react";
import {
  QUICK_FIELDS,
  UNKNOWN,
  answerPatch,
  type QuickField,
  type QuickPatch,
  type QuickRecord,
} from "@/components/portal/quick-answers";

/** The cards tapped on one record that the server has not confirmed yet. */
export type PendingChoices = Partial<Record<QuickField, string>>;

const NO_MARKS: ReadonlySet<string> = new Set();

/** One key per record and field. Ids never carry a newline. */
export function markKey(id: string, field: QuickField): string {
  return `${id}\n${field}`;
}

/**
 * Every tap on the quick answers page is saved at once, through the same
 * list hooks the editor and the list save through, and never two saves of one
 * record at a time.
 *
 * The page is built for tapping five answers in a row, faster than a save
 * comes back. The crawled animals' hook drops a second PUT for an animal it
 * already has one out for, and a manual listing is a full replace, where two
 * PUTs out at once would each carry the other's field back as it was. So the
 * taps on one record queue: the card shows the new answer straight away, one
 * save goes out, and whatever was tapped meanwhile follows in the next one,
 * built on the record the previous save answered with.
 *
 * A failed save drops what was waiting for that record, so its cards fall back
 * to what is stored, and the list hook's own error state says what happened.
 *
 * `send` saves one patch and answers with the record as it now stands, or
 * null when nothing was stored. `own` says whether a field's current value is
 * the shelter's own, which decides whether Ne vem has anything to take back.
 */
export function useQuickAnswerSaves<R extends QuickRecord>(
  send: (record: R, patch: QuickPatch) => Promise<R | null>,
  own: (record: R, field: QuickField) => boolean,
): {
  /** What each record's cards show until its save comes back. */
  pending: Readonly<Record<string, PendingChoices>>;
  /**
   * Rows answered Ne vem in this visit, by markKey. Ne vem stores no value,
   * so this is the only place the choice is kept.
   */
  unknowns: ReadonlySet<string>;
  answer: (record: R, field: QuickField, choice: string) => void;
  /** Whether a save of this record is still on its way. For handlers only:
   *  it reads the loop's own bookkeeping, which is not render state. */
  busy: (id: string) => boolean;
  /** Resolves once the record has nothing on its way: true, or false when a
   *  save failed. At once when nothing was. */
  settled: (id: string) => Promise<boolean>;
} {
  const [pending, setPending] = useState<Readonly<Record<string, PendingChoices>>>({});
  const [unknowns, setUnknowns] = useState<ReadonlySet<string>>(NO_MARKS);
  // The same pending choices, for the save loop to read between its awaits,
  // where the state of the render that started it is already out of date.
  const waiting = useRef<Record<string, PendingChoices>>({});
  // The records a save loop is running for, and who is waiting on each.
  const running = useRef(new Set<string>());
  const waiters = useRef(new Map<string, ((ok: boolean) => void)[]>());

  function writePending(id: string, choices: PendingChoices | null) {
    const next = { ...waiting.current };
    if (choices && Object.keys(choices).length > 0) next[id] = choices;
    else delete next[id];
    waiting.current = next;
    setPending(next);
  }

  function mark(id: string, fields: readonly QuickField[], on: boolean) {
    setUnknowns((current) => {
      const next = new Set(current);
      for (const field of fields) {
        if (on) next.add(markKey(id, field));
        else next.delete(markKey(id, field));
      }
      return next;
    });
  }

  /** Every pending choice as one patch, against what the record holds now. */
  function patchFor(record: R, choices: PendingChoices): QuickPatch {
    const patch: QuickPatch = {};
    for (const field of QUICK_FIELDS) {
      const choice = choices[field];
      if (choice === undefined) continue;
      Object.assign(patch, answerPatch(record, field, choice, own(record, field)));
    }
    return patch;
  }

  async function flush(start: R) {
    const id = start.id;
    if (running.current.has(id)) return;
    running.current.add(id);
    // The record as the server last answered it. The list hook replaces its
    // own copy from the same answer, but that copy only reaches this closure
    // on the next render, and the next save is built before then.
    let known = start;
    let ok = true;
    try {
      for (;;) {
        const sent = waiting.current[id];
        if (!sent) break;
        const patch = patchFor(known, sent);
        if (Object.keys(patch).length > 0) {
          let saved: R | null = null;
          try {
            saved = await send(known, patch);
          } catch {
            saved = null;
          }
          if (!saved) {
            ok = false;
            writePending(id, null);
            mark(
              id,
              QUICK_FIELDS.filter((field) => sent[field] !== undefined),
              false,
            );
            break;
          }
          known = saved;
        }
        // Only what was tapped again while that save was out stays behind.
        const now = waiting.current[id] ?? {};
        const rest: PendingChoices = {};
        for (const field of QUICK_FIELDS) {
          const choice = now[field];
          if (choice !== undefined && choice !== sent[field]) rest[field] = choice;
        }
        writePending(id, rest);
      }
    } finally {
      running.current.delete(id);
      const queued = waiters.current.get(id) ?? [];
      waiters.current.delete(id);
      for (const resolve of queued) resolve(ok);
    }
  }

  function answer(record: R, field: QuickField, choice: string) {
    mark(record.id, [field], choice === UNKNOWN);
    writePending(record.id, { ...waiting.current[record.id], [field]: choice });
    void flush(record);
  }

  function busy(id: string): boolean {
    return running.current.has(id);
  }

  function settled(id: string): Promise<boolean> {
    if (!running.current.has(id)) return Promise.resolve(true);
    return new Promise((resolve) => {
      waiters.current.set(id, [...(waiters.current.get(id) ?? []), resolve]);
    });
  }

  return { pending, unknowns, answer, busy, settled };
}
