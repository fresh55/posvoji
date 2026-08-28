import { Globe, Mail, MapPin, Phone, ShieldCheck } from "lucide-react";
import { ShelterAvatar } from "@/components/shelter-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { mailtoHref, telHref } from "@/lib/contact-links";
import type { Locale } from "@/lib/i18n";
import { animalCount } from "@/lib/labels";
import type { ShelterLogo } from "@/lib/shelter-logos";

/** What a card needs, and nothing else. The grid is a client component so a
 *  filter can hide rows without a round trip, which makes this shape the
 *  payload: shelters.yaml's `notes` in particular never crosses, because it
 *  is working material for the project rather than anything a visitor reads. */
export type ShelterCardData = {
  id: string;
  name: string;
  city: string;
  href: string;
  /** The animals grid filtered to this shelter. Set only where the count is
   *  above zero, because the filter would otherwise land on an empty grid
   *  behind a chip naming a shelter that has nothing in it. */
  animalsHref?: string;
  count: number;
  logo?: ShelterLogo;
  website?: string;
  email?: string;
  phone?: string;
};

export type ShelterCardText = {
  /** The provider pill's words, with the animal count folded in after them. */
  provider: string;
  contactOnly: string;
  website: string;
  email: string;
  phone: string;
};

// What a ghost icon button does not already say. relative + z-10 lifts the
// link over the name's stretched overlay, which otherwise covers the whole
// card including this; tap-target's 44px layer reaches 10px past the size-6
// button, which the card's p-4 holds, so nothing is clipped.
const CONTACT_LINK = "relative z-10 text-muted-foreground max-lg:tap-target";

export function ShelterCard({
  shelter,
  locale,
  text,
  showContactOnly,
}: {
  shelter: ShelterCardData;
  locale: Locale;
  text: ShelterCardText;
  /** Whether to print the contact-only line. False while no shelter shares a
   *  list, when the words would land on every card in the grid and so
   *  distinguish none of them. */
  showContactOnly: boolean;
}) {
  const hasAnimals = shelter.count > 0;
  // The same children whether or not the badge is a link, so the label cannot
  // drift between the two.
  const providerMark = (
    <>
      <ShieldCheck aria-hidden />
      {`${text.provider} · ${animalCount(shelter.count, locale)}`}
    </>
  );

  return (
    <Card asChild>
      <li
        // relative, because the name's anchor stretches an ::after over this
        // whole box: the card is clickable without being one giant <a> whose
        // accessible name is every word printed on it.
        //
        // min-w-0, or this card sets the width of the column it sits in. As a
        // grid item its automatic minimum size is its min-content width. That
        // used to be the name in full: `truncate` is white-space: nowrap,
        // whose min-content is the whole name however long it runs, so the
        // track grew to fit "Zavetišče za zapuščene živali Ljubljana"
        // unbroken and overflowed the page (measured on a 390px phone: a
        // 358px grid holding a 413px card, and the whole document scrolling
        // sideways). The name wraps now, so min-content is only its longest
        // word and the blowout cannot come back; this stays because the city
        // line below still truncates.
        className="group relative flex min-w-0 flex-col gap-3 p-4 transition-colors hover:border-foreground/25 hover:bg-muted/30 has-[[data-card-link]:focus-visible]:border-ring has-[[data-card-link]:focus-visible]:ring-3 has-[[data-card-link]:focus-visible]:ring-ring/50"
      >
        <div className="flex items-center gap-3">
          <ShelterAvatar
            name={shelter.name}
            logo={shelter.logo}
            accent={hasAnimals}
          />
          <div className="min-w-0 flex-1">
            <h2 className="line-clamp-2 text-balance font-medium leading-snug">
              <a
                href={shelter.href}
                data-card-link
                className="underline-offset-4 outline-none after:absolute after:inset-0 after:rounded-ui group-hover:underline"
              >
                {shelter.name}
              </a>
            </h2>
            <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
              <MapPin className="size-3 shrink-0" aria-hidden />
              {shelter.city}
            </p>
          </div>
        </div>

        <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-2">
          {hasAnimals ? (
            // The count is the one thing on this card a reader can act on
            // directly, so it carries a link of its own: the animals grid with
            // this shelter already chosen, which is a shorter way to the
            // animals than the profile page in between. z-10 lifts it over the
            // name's stretched overlay, same as the contact links.
            <Badge asChild={shelter.animalsHref !== undefined} variant="accent">
              {shelter.animalsHref ? (
                <a
                  href={shelter.animalsHref}
                  className="relative z-10 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  {providerMark}
                </a>
              ) : (
                providerMark
              )}
            </Badge>
          ) : (
            showContactOnly && (
              <span className="text-xs text-muted-foreground">
                {text.contactOnly}
              </span>
            )
          )}

          <div className="ml-auto flex items-center gap-0.5">
            {shelter.website && (
              <Button asChild variant="ghost" size="icon-xs" className={CONTACT_LINK}>
                <a
                  href={shelter.website}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`${text.website}: ${shelter.name}`}
                >
                  <Globe aria-hidden />
                </a>
              </Button>
            )}
            {shelter.email && (
              <Button asChild variant="ghost" size="icon-xs" className={CONTACT_LINK}>
                <a
                  href={mailtoHref(shelter.email)}
                  aria-label={`${text.email}: ${shelter.name}`}
                >
                  <Mail aria-hidden />
                </a>
              </Button>
            )}
            {shelter.phone && (
              <Button asChild variant="ghost" size="icon-xs" className={CONTACT_LINK}>
                <a
                  href={telHref(shelter.phone)}
                  aria-label={`${text.phone}: ${shelter.name}`}
                >
                  <Phone aria-hidden />
                </a>
              </Button>
            )}
          </div>
        </div>
      </li>
    </Card>
  );
}
