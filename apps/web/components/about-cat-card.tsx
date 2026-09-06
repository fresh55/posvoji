import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { Locale } from "@/lib/i18n";
import { META_DOT_CLASS, statusLabel } from "@/lib/labels";

const copy = {
  sl: { name: "Srečko", meta: ["Maček", "s FeLV"] },
  en: { name: "Srečko", meta: ["Cat", "with FeLV"] },
} satisfies Record<Locale, { name: string; meta: string[] }>;

/**
 * Srečko as the site would list him.
 *
 * A caption under the cat kept trying to be prose and kept saying nothing: at
 * its worst it told the reader that every animal on the list is waiting for a
 * home, which the lede beside it had already said. The fix is not better
 * sentences. It is to stop writing about him and describe him the way this
 * site describes an animal, because the page is on a site that does exactly
 * one thing and this is what that thing looks like.
 *
 * So it is a card with a name, a badge and a two-fact line, the anatomy every
 * card in the grid has. What it does that no other card can is carry
 * "posvojeno" as a settled fact rather than a hope, and that is the whole
 * argument for the site made without a word of argument: the reader has just
 * scrolled a grid of animals waiting for this, and here is the one where it
 * already happened.
 *
 * The word comes from labels.ts rather than being typed here, so his badge
 * and an adopted animal's badge cannot drift apart. Two facts and no more,
 * the rule the real card keeps for its own reasons; the colour of his coat is
 * in the picture above and does not need saying.
 *
 * The second fact is FeLV, and it is the one that had to be here. The site
 * models the virus as a field on a cat and offers "Brez FeLV" as a filter,
 * which matches only the cats that tested negative: a positive cat is the one
 * that filter hides, and the one a shelter has the hardest time placing.
 * Saying he had it is the whole argument for a list nobody can buy a better
 * position on, made as a fact about one animal rather than as a claim about
 * ourselves. The page's dedication finishes the thought.
 *
 * No shelter named: the page promises a row below that nobody buys a place on
 * this list. Nothing about the household either, for the reason the fourth
 * fact gives.
 */
export function AboutCatCard({ locale }: { locale: Locale }) {
  const text = copy[locale];

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="font-medium leading-snug">{text.name}</p>
        {/* The treatment globals.css records for a settled animal: muted
            ground, no colour. He is not news, he is the outcome. */}
        <Badge variant="quiet">{statusLabel("adopted", locale)}</Badge>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {text.meta.map((part, index) => (
          <span key={part}>
            {index > 0 && <span className={META_DOT_CLASS}> · </span>}
            {part}
          </span>
        ))}
      </p>
    </Card>
  );
}
