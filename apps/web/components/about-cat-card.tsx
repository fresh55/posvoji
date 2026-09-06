import { Card } from "@/components/ui/card";
import type { Locale } from "@/lib/i18n";

const copy = {
  sl: {
    name: "Srečko",
    body: "Posvojili smo ga iz zavetišča. Vsaka žival na tem seznamu čaka na isto.",
  },
  en: {
    name: "Srečko",
    body: "Lucky, in Slovenian. We adopted him from a shelter. Every animal on this list is waiting for the same.",
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
 * The last sentence is the one that earns the card its place. His name and
 * his adoption are a fact about one cat, and a fact about one cat is a nice
 * caption and nothing more; what the page needs is the reason he is on it.
 * He got the thing every animal in the register is still waiting for, so the
 * card ends by saying so, and the reader looks back at the list differently.
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
