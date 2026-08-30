import { Globe, Mail, MapPin, Phone } from "lucide-react";
import { ShelterAvatar } from "@/components/shelter-avatar";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { mailtoHref, telHref } from "@/lib/contact-links";
import type { ShelterLogo } from "@/lib/shelter-logos";

/** What a card needs, and nothing else.
 *
 *  Four things: who, where, how to reach them, and their mark. The animal
 *  count and the občina coverage were both on this card for a while and both
 *  came off: the count belongs to the animals grid it links into and is
 *  already said in the page's own census line, and the coverage question is
 *  the found-animal lookup's whole job. A register card answers "who is this
 *  and how do I reach them", and stops. */
export type ShelterCardData = {
  id: string;
  name: string;
  city: string;
  href: string;
  logo?: ShelterLogo;
  website?: string;
  email?: string;
  phone?: string;
};

export type ShelterCardText = {
  website: string;
  email: string;
  phone: string;
  /** "(odpre se v novem oknu)" / "(opens in a new window)". The website link
   *  is the one thing on the card that leaves the site, and target="_blank"
   *  announces nothing on its own. */
  newWindow: string;
};

// Every contact sits under the name's stretched ::after, which covers the whole
// card, so each needs relative + z-10 to take its own presses.
//
// A row, not an icon. Behind a 24px glyph the number lived only in an
// aria-label, so a desktop reader who had just found a stray could see that a
// shelter had a phone and never what it was. min-h-9 keeps each row a real
// target without the 44px a bare icon needed, because the row is the target.
const CONTACT_ROW =
  "relative z-10 flex min-h-9 items-center gap-2.5 rounded-ui text-sm text-muted-foreground underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring";

/** A website as the part of it worth reading. The scheme and the www are on
 *  every one of them, and the card has room for the host, not the URL. */
function websiteLabel(url: string): string {
  return url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
}

/**
 * One shelter, as a card.
 *
 * Cards were tried twice on this page and failed twice, both times because
 * they were empty: a name, a town and three 24px glyphs is a box full of air,
 * and no grid geometry rescues that. What fills it is the logo given room of
 * its own and the contacts printed rather than hidden, which is also the whole
 * of what a reader came for. A page of full cards needs no search, no tabs and
 * no detail pane, because there is nothing left behind them.
 *
 * The logo sits on its own line above the name rather than beside it. Beside
 * it, eleven wordmarks running from square to five times as wide started every
 * name at a different x; above it, each one can keep its own proportions
 * inside a fixed plate and no neighbouring line has to agree with it.
 */
export function ShelterCard({
  shelter,
  text,
}: {
  shelter: ShelterCardData;
  text: ShelterCardText;
}) {
  const host = shelter.website ? websiteLabel(shelter.website) : undefined;

  return (
    <Item asChild variant="outline">
      <li
        id={`zavetisce-${shelter.id}`}
        // relative, because the name's anchor stretches an ::after over this
        // whole box: the card is clickable without being one giant <a> whose
        // accessible name is every word printed on it.
        className="group relative scroll-mt-24 transition-[border-color,box-shadow] hover:border-foreground/40 hover:shadow-sm focus-within:border-foreground/40 focus-within:shadow-sm has-[[data-card-link]:focus-visible]:border-ring has-[[data-card-link]:focus-visible]:ring-3 has-[[data-card-link]:focus-visible]:ring-ring"
      >
        <ItemMedia>
          <ShelterAvatar name={shelter.name} logo={shelter.logo} track />
        </ItemMedia>

        <ItemContent>
          <ItemTitle asChild>
            <h3>
              <a
                href={shelter.href}
                data-card-link
                className="underline-offset-4 outline-none after:absolute after:inset-0 after:rounded-ui group-hover:underline"
              >
                {shelter.name}
              </a>
            </h3>
          </ItemTitle>
          <ItemDescription className="flex items-center gap-1">
            <MapPin className="size-3 shrink-0" aria-hidden />
            <span className="truncate">{shelter.city}</span>
          </ItemDescription>
        </ItemContent>

        {(shelter.phone || shelter.email || shelter.website) && (
          <ItemFooter asChild className="mt-0">
            {/* ItemFooter carries the column; this card overrides its mt-auto
                and takes only the row spacing on the list itself.

                mt-auto lines the blocks up by their bottom edge across a row,
                which is the wrong edge here: the contacts are printed rows
                rather than a bar of icons, so a card holding a phone alone had
                its one row sitting level with its neighbours' email rows, a
                phone reading across from an address, and a gap of air where
                the town ended. Top-aligned, the rows line up by what they are
                (phone with phone, email with email) and the slack a short card
                has left over falls to the bottom of the card, where nothing is
                printed.

                The override is spelled on ItemFooter rather than on the ul,
                because ItemFooter's className goes through cn(): tailwind-merge
                drops the mt-auto and leaves one margin utility, where Slot
                would have concatenated both classes and left the winner to
                stylesheet order. ItemFooter itself is untouched; mt-auto is
                still right for an item whose footer is a row of controls. */}
            <ul className="gap-0.5">
              {shelter.phone && (
                // The visible number is the label and the accessible name adds
                // the channel in front of it, which is what WCAG 2.5.3 asks of
                // a control whose label is visible.
                <li>
                  <a
                    href={telHref(shelter.phone)}
                    className={CONTACT_ROW}
                    aria-label={`${text.phone}: ${shelter.phone}`}
                  >
                    <Phone className="size-3.5 shrink-0" aria-hidden />
                    <span className="truncate">{shelter.phone}</span>
                  </a>
                </li>
              )}
              {shelter.email && (
                <li>
                  <a
                    href={mailtoHref(shelter.email)}
                    className={CONTACT_ROW}
                    aria-label={`${text.email}: ${shelter.email}`}
                  >
                    <Mail className="size-3.5 shrink-0" aria-hidden />
                    <span className="truncate">{shelter.email}</span>
                  </a>
                </li>
              )}
              {shelter.website && host !== undefined && (
                <li>
                  {/* The only link on the card that leaves the site, and
                      target="_blank" is silent about it, so the accessible
                      name says so. One host, computed once: the name and the
                      visible text are the same string by construction, which
                      is what the sentence above promises. */}
                  <a
                    href={shelter.website}
                    target="_blank"
                    rel="noreferrer"
                    className={CONTACT_ROW}
                    aria-label={`${text.website}: ${host} ${text.newWindow}`}
                  >
                    <Globe className="size-3.5 shrink-0" aria-hidden />
                    <span className="truncate">{host}</span>
                  </a>
                </li>
              )}
            </ul>
          </ItemFooter>
        )}
      </li>
    </Item>
  );
}
