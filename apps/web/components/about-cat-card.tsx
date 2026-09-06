import { ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { Locale } from "@/lib/i18n";
import { shelterPath } from "@/lib/shelter-path";

// The shelter he came from, and it is one of ours: macja-hisa is in
// data/shelters.yaml and shares its animals, so this link lands on a page of
// cats waiting for the thing the card describes. The id rather than a written
// address, because lib/shelter-path.ts owns both halves of that route pair.
const SHELTER_ID = "macja-hisa";

const copy = {
  sl: {
    name: "Srečko",
    body: "Posvojili smo ga v Mačji hiši. Desno oko se mu je zacelilo zaprto, levo je olivno zeleno.",
    shelter: "Zavetišče Mačja hiša",
  },
  en: {
    name: "Srečko",
    body: "His name means Lucky. We adopted him from Mačja hiša, and his right eye healed shut. The left one is olive green.",
    shelter: "Mačja hiša shelter",
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
 * The shelter is a link rather than a mention for the same reason. Mačja hiša
 * is in the register with animals on the site today, so the sentence ends on
 * a way into them instead of on a full stop.
 *
 * About the cat and the shelter, and not about the household that adopted
 * him. The page's fourth fact is that personal details do not belong here,
 * and it would be a strange page that broke its own rule directly under the
 * heading.
 */
export function AboutCatCard({ locale }: { locale: Locale }) {
  const text = copy[locale];

  return (
    <Card className="p-4">
      {/* A caption, so it names the figure above it rather than announcing
          itself as a section. text-sm throughout: it sits opposite the facts
          and must not out-rank them. */}
      <p className="text-sm leading-relaxed text-muted-foreground">
        <b className="font-medium text-foreground">{text.name}</b>
        {". "}
        {text.body}
      </p>
      <a
        href={shelterPath(SHELTER_ID, locale)}
        className="mt-2.5 inline-flex items-center gap-1.5 text-sm font-medium underline-offset-4 hover:underline max-lg:tap-target"
      >
        {text.shelter}
        <ArrowRight className="size-3.5 shrink-0" aria-hidden />
      </a>
    </Card>
  );
}
