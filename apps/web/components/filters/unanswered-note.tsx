"use client";

import { useId } from "react";
import { SectionNote } from "@/components/filters/filter-section-header";
import { useI18n } from "@/components/i18n-context";
import {
  answeredByNone,
  namesUnanswered,
  type Unanswered,
} from "@/lib/filters";

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
 *
 * When not one of the animals has an answer (answeredByNone), every row reads
 * 0 and there is nothing to pick, so "a pick shows only animals with data"
 * sent the visitor after a row they could not press. The line says the one
 * true thing instead. No row names this line as its description, so the
 * change reaches a screen reader as the text it reads in order.
 */
export function UnansweredNote({ tally }: { tally?: Unanswered }) {
  const { messages, t } = useI18n();
  if (!tally || !namesUnanswered(tally)) return null;
  return (
    <SectionNote>
      {answeredByNone(tally)
        ? messages.unansweredNone
        : t("unansweredLine", { count: tally.unanswered })}
    </SectionNote>
  );
}

/**
 * The same for a section that asks several questions, one per row: the line
 * under each row that has a count worth saying, and the id the row names it
 * by as its description.
 *
 * `section` is what the section then says once, under all of them. "hides"
 * while some row a visitor can pick leaves animals out, which is when the
 * sentence about what a pick does is true. "none" when no row has a single
 * answer. A row with no answers at all keeps its own count, which is still
 * true, but does not earn the "hides" sentence on its own: it reads 0 and
 * cannot be picked.
 *
 * `keys` are the rows drawn and `sectionKeys` every option the section has.
 * The sidebar leaves dead rows out (drawnOptions in filter-groups.tsx) and
 * keeps the first when all are dead, so "none" is judged over every option:
 * over the one row kept it would claim for the whole section what is true of
 * that row alone.
 */
export function useRowNotes<Key extends string>(
  keys: readonly Key[],
  tally: Readonly<Record<Key, Unanswered>> | undefined,
  message: "unansweredRow" | "goodWithUnansweredRow",
  sectionKeys: readonly Key[] = keys,
) {
  const { t } = useI18n();
  const id = useId();
  const notes = keys.map((key) => {
    const count = tally?.[key];
    return count && namesUnanswered(count)
      ? t(message, { count: count.unanswered })
      : undefined;
  });
  const section: "hides" | "none" | undefined =
    tally === undefined || sectionKeys.length === 0
      ? undefined
      : sectionKeys.every((key) => answeredByNone(tally[key]))
        ? "none"
        : keys.some(
              (key, index) =>
                notes[index] !== undefined && !answeredByNone(tally[key]),
            )
          ? "hides"
          : undefined;
  return {
    section,
    at: (index: number) => ({
      description: notes[index],
      descriptionId: `${id}-${keys[index]}`,
    }),
  };
}
