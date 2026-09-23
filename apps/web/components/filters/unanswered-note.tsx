"use client";

import { NOTE_CLASS } from "@/components/filters/filter-card";
import { useI18n } from "@/components/i18n-context";
import { namesUnanswered, type Unanswered } from "@/lib/filters";
import { cn } from "@/lib/utils";

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
    <p className={cn("mt-2", NOTE_CLASS)}>
      {t("unansweredLine", { count: tally.unanswered })}
    </p>
  );
}

/** The sentence a section asking several questions says once under all of
 *  them, when any of its rows names a count. */
export function UnansweredHides({
  message,
}: {
  message: "unansweredHides" | "goodWithUnansweredLine";
}) {
  const { messages } = useI18n();
  return <p className={cn("mt-2", NOTE_CLASS)}>{messages[message]}</p>;
}

/** The count for one option of a section that asks several questions, for
 *  the line under that option's label, or nothing where it is not worth
 *  saying. */
export function useUnansweredRow(
  message: "unansweredRow" | "goodWithUnansweredRow",
) {
  const { t } = useI18n();
  return (tally: Unanswered | undefined): string | undefined =>
    tally && namesUnanswered(tally)
      ? t(message, { count: tally.unanswered })
      : undefined;
}
