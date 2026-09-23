"use client";

import { useId } from "react";
import { SectionNote } from "@/components/filters/filter-section-header";
import { useI18n } from "@/components/i18n-context";
import { namesUnanswered, type Unanswered } from "@/lib/filters";

/**
 * The line under a section's rows once a tenth or more of the animals it is
 * asked of have no answer (namesUnanswered in lib/filters/engine.ts): how many,
 * and that a pick leaves them out.
 *
 * Drawn text on both surfaces. The panel used to say this, where it said it at
 * all, in a hint that folds into the heading's tooltip on a mouse, so the
 * desktop visitor who ticked Majhna and got 12 of 491 never saw why. A count
 * with no sentence after it left the other half to guess, which is the half
 * that matters: those animals are not small, large or anything else, nobody
 * said.
 */
export function UnansweredNote({ tally }: { tally?: Unanswered }) {
  const { t } = useI18n();
  if (!tally || !namesUnanswered(tally)) return null;
  return (
    <SectionNote>{t("unansweredLine", { count: tally.unanswered })}</SectionNote>
  );
}

/**
 * The same for a section that asks several questions, one per row: the line
 * under each row that has a count worth saying, and the id the row names it
 * by as its description. `any` is whether a row says one at all, which is
 * when the section says once, under all of them, what a pick does with them.
 */
export function useRowNotes<Key extends string>(
  keys: readonly Key[],
  tally: Readonly<Record<Key, Unanswered>> | undefined,
  message: "unansweredRow" | "goodWithUnansweredRow",
) {
  const { t } = useI18n();
  const id = useId();
  const notes = keys.map((key) => {
    const count = tally?.[key];
    return count && namesUnanswered(count)
      ? t(message, { count: count.unanswered })
      : undefined;
  });
  return {
    any: notes.some((note) => note !== undefined),
    at: (index: number) => ({
      description: notes[index],
      descriptionId: `${id}-${keys[index]}`,
    }),
  };
}
