"use client";

import { useState, type RefObject } from "react";
import {
  readBoxControl,
  type ReadBox,
} from "@/components/portal/portal-fields";

/**
 * The boxes the browser could not read a value out of, for both editor pages.
 *
 * "2-1" in a number box and a year of 0001 in the date box both reach the
 * change handler as an empty value with validity.badInput set, so the draft
 * says "" while the box still shows what was typed. Kept apart from the draft
 * on purpose: a sentinel in the controlled value would be written back over
 * the shelter's text. While any box is here, the page has work it cannot read
 * and must neither save nor drop silently.
 *
 * Which box the submit refuses first is the page's own, because the two forms
 * do not ask in the same order.
 */
export function useReadBoxes(form: RefObject<HTMLFormElement | null>): {
  unreadable: ReadonlySet<ReadBox>;
  /** Notes a box as readable or not, from a change or an input event. */
  mark: (box: ReadBox, bad: boolean) => void;
  /**
   * The draft as far as it can be read: a box the browser could not read
   * holds "" in the draft, which the patch would take for an emptied box and
   * send as the null that clears the shelter's own value. Those boxes count as
   * untouched. The draft itself while no box is at fault, so nothing that
   * watches the draft's identity sees a new object on every render.
   */
  readable: <Draft extends Record<ReadBox, string>>(
    draft: Draft,
    base: Draft,
  ) => Draft;
  /**
   * Empties the boxes the browser could not read. Their text lives in the DOM
   * alone: the draft only ever held "" for them, so setting it to "" again is
   * no change React would write back, and the text would stay.
   */
  empty: (boxes: readonly ReadBox[]) => void;
} {
  const [unreadable, setUnreadable] = useState<ReadonlySet<ReadBox>>(
    () => new Set(),
  );

  function mark(box: ReadBox, bad: boolean) {
    setUnreadable((current) => {
      if (current.has(box) === bad) return current;
      const next = new Set(current);
      if (bad) next.add(box);
      else next.delete(box);
      return next;
    });
  }

  function readable<Draft extends Record<ReadBox, string>>(
    draft: Draft,
    base: Draft,
  ): Draft {
    if (unreadable.size === 0) return draft;
    const next = { ...draft };
    // Every read box is a text box in both drafts, so this is a string over a
    // string; the cast is only to write through the generic.
    for (const box of unreadable) {
      (next as Record<ReadBox, string>)[box] = base[box];
    }
    return next;
  }

  function empty(boxes: readonly ReadBox[]) {
    const stale = boxes.filter((box) => unreadable.has(box));
    if (stale.length === 0) return;
    for (const box of stale) {
      const control = readBoxControl(form.current, box);
      if (control) control.value = "";
    }
    setUnreadable((current) => {
      const next = new Set(current);
      for (const box of stale) next.delete(box);
      return next;
    });
  }

  return { unreadable, mark, readable, empty };
}
