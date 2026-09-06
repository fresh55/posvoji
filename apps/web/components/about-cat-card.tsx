import { Card } from "@/components/ui/card";
import type { Locale } from "@/lib/i18n";

const copy = {
  sl: {
    name: "Srečko",
    body: "Posvojili smo ga iz zavetišča.",
  },
  en: {
    name: "Srečko",
    body: "Lucky, in Slovenian. We adopted him from a shelter.",
  },
} satisfies Record<Locale, Record<string, string>>;

/**
 * Who the cat is.
 *
 * Without it the model is decoration: a reader meets a cat on a page that
 * never mentions one, and the only text about him is a licence credit in the
 * footer, which answers a question nobody asked. Named, he is the one
 * concrete thing on a page whose five facts are otherwise abstractions, and
 * four of those are denials - no ads, no tracking, no accounts, no personal
 * data. He is also the only proof on it that any of this works.
 *
 * Two clauses, and it stops. It carried a third for a while, that every
 * animal on the list is waiting for what he already got, which sounded like
 * the point and was not: the lede four inches to the left already says the
 * site is a list of animals looking for a home, so the sentence spent the
 * reader's attention telling them something they had just read. What a
 * visitor could not get anywhere else on this page is that the cat can be
 * turned and touched, and that line belongs with the viewer that makes it
 * true, not here. See about-cat.tsx.
 *
 * No shelter named, and no link to one. The card sits one row above the page
 * promising that nobody pays for a place or a better position on the list,
 * and the site's own about page sending its readers to one shelter out of
 * seventeen is the nearest thing to breaking that promise. "Iz zavetišča"
 * carries the part that matters, which is that he was waiting somewhere.
 *
 * About the cat, and not about the household that adopted him, for the same
 * reason: the page's fourth fact is that personal details do not belong here.
 */
export function AboutCatCard({ locale }: { locale: Locale }) {
  const text = copy[locale];

  return (
    <Card className="p-4">
      {/* A caption, so it names the figure above it rather than announcing
          itself as a section. text-sm: it sits opposite the facts and must
          not out-rank them. */}
      <p className="text-sm leading-relaxed text-muted-foreground">
        <b className="font-medium text-foreground">{text.name}</b>
        {". "}
        {text.body}
      </p>
    </Card>
  );
}
