"use client";

import { useId, type ReactNode, type Ref } from "react";
import { useI18n } from "@/components/i18n-context";
import { Button } from "@/components/ui/button";
import type { Question, SpeciesFilter } from "@/lib/filters";
import type { TranslationKey } from "@/lib/i18n";
import {
  questionTopic,
  tabCountAt,
  tabCountShown,
  tabPronoun,
} from "@/lib/labels";
import { COARSE_ACTION } from "@/lib/link-styles";
import { cn } from "@/lib/utils";

/** The words for the one question the band's animals leave unanswered, or
 *  undefined when they leave several and the words have to cover all of
 *  them. */
function topicOf(missing: readonly Question[]): TranslationKey | undefined {
  if (missing.length !== 1) return undefined;
  const topic = questionTopic(missing[0]);
  return topic && (`bandTopic${topic}` as const);
}

/**
 * The offer under the last match: one sentence saying how many animals the
 * filters hid for want of an answer, and the button that brings them. Drawn
 * inside the card grid on a row of its own, and only once every match is
 * drawn, which is where a visitor has run out of the list and is looking for
 * more.
 */
export function BandOffer({
  count,
  missing,
  species,
  onShow,
  buttonRef,
}: {
  count: number;
  missing: readonly Question[];
  species: SpeciesFilter;
  onShow: () => void;
  buttonRef: Ref<HTMLButtonElement>;
}) {
  const { locale, t } = useI18n();
  const sentenceId = useId();
  const topic = topicOf(missing);
  const counted = tabCountAt(count, species, locale);
  return (
    <div className="col-span-full flex flex-wrap items-center justify-center gap-x-3 gap-y-2 py-2 text-center">
      <p id={sentenceId} className="text-sm text-muted-foreground">
        {topic
          ? t("bandLine", { count: counted, topic: t(topic) })
          : t("bandLineSeveral", { count: counted })}
      </p>
      {/* The sentence as its description, because "Pokaži jih" alone says
          nothing to someone who reached the button by Tab. */}
      <Button
        ref={buttonRef}
        variant="outline"
        size="sm"
        className={COARSE_ACTION}
        aria-describedby={sentenceId}
        onClick={onShow}
      >
        {t("bandShow", { them: tabPronoun(count, species, locale) })}
      </Button>
    </div>
  );
}

/** The empty state's version of the offer, beside its other ways out. There
 *  is no sentence before it to carry the count, so the button carries it. */
export function BandShowButton({
  count,
  species,
  onShow,
  buttonRef,
}: {
  count: number;
  species: SpeciesFilter;
  onShow: () => void;
  buttonRef: Ref<HTMLButtonElement>;
}) {
  const { locale, t } = useI18n();
  return (
    <Button
      ref={buttonRef}
      variant="outline"
      size="sm"
      className={COARSE_ACTION}
      onClick={onShow}
    >
      {t("bandShowCount", { count: tabCountShown(count, species, locale) })}
    </Button>
  );
}

/** The grid's cards with the divider put in among them where the band starts:
 *  one keyed list, so a card keeps its node whichever side of the divider a
 *  filter change leaves it on. `at` is undefined while the band is not shown,
 *  and past the cards drawn while the matches are still being drawn. */
export function withBandDivider(
  cards: ReactNode[],
  at: number | undefined,
  divider: ReactNode,
): ReactNode[] {
  if (at === undefined || at > cards.length) return cards;
  return [...cards.slice(0, at), divider, ...cards.slice(at)];
}

/**
 * The row the band starts under once it is shown: what its animals lack, and
 * the way to put them away again. A heading, so the band is a part of the page
 * of its own that a screen reader can find and skip, and the cards under it
 * are read as its own. Its rule is dropped where it is the first thing in the
 * grid, straight under the toolbar's.
 */
export function BandDivider({
  missing,
  onHide,
}: {
  missing: readonly Question[];
  onHide: () => void;
}) {
  const { t } = useI18n();
  const labelId = useId();
  const topic = topicOf(missing);
  return (
    <div className="col-span-full flex flex-wrap items-center gap-x-3 gap-y-1 border-t pt-4 first:border-t-0 first:pt-0">
      <h2 id={labelId} className="text-sm font-medium">
        {topic ? t("bandLabel", { topic: t(topic) }) : t("bandLabelSeveral")}
      </h2>
      <Button
        variant="link"
        size="sm"
        className={cn(
          COARSE_ACTION,
          "px-0 text-muted-foreground underline hover:text-foreground",
        )}
        aria-describedby={labelId}
        onClick={onHide}
      >
        {t("bandHide")}
      </Button>
    </div>
  );
}
