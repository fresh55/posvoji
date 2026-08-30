import { Globe, Mail, MapPin, PawPrint, Phone } from "lucide-react";
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
 *  Five things: who, where, how many animals they share with us, how to reach
 *  them, and their mark. The občina coverage was on this card for a while and
 *  came off, because that question is the found-animal lookup's whole job.
 *
 *  The animal count came off with it and is back, on a narrower reading. The
 *  page's census line states a total ("503 živali čakajo na dom") and a count
 *  of shelters sharing data, and neither says which shelters those are or how
 *  many animals any one of them holds. The card is the only place that can
 *  answer that, so it carries the shelter's own number and the register can be
 *  read against its own totals. */
export type ShelterCardData = {
  id: string;
  name: string;
  city: string;
  href: string;
  /** How many animals the dataset holds for this shelter. Absent or zero for
   *  a shelter that shares no list: the page never prints a zero, because a
   *  zero here reads as a shelter with no animals rather than as a shelter we
   *  publish nothing for. */
  animals?: number;
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
  /** "5 živali" / "5 animals", from lib/labels.ts. A function rather than a
   *  string, because Slovenian agrees the noun with the number (žival, živali)
   *  and the card is a server component with no locale of its own: the page
   *  holds the locale and hands the card the one formatter it needs. */
  animals: (count: number) => string;
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
        {/* The mark on the left, the count on the right, on one line above the
            name.

            The count sits here rather than under the town, where it began,
            because it is the one thing on the card that only some shelters
            have. Under the town it was part of the text stack, so the eleven
            cards carrying it pushed their contacts a line below the six that
            do not: at 1440px the first row's phones sat at 575, 603 and 575,
            which is the stagger the footer's mt-0 and the title's reserved
            line exist to prevent. Up here it shares a row that every card
            draws at the same height whatever else is true, so the text below
            starts at one y across the whole grid.

            It reads better for the scan, too. Ranged right on a fixed row, the
            counts form a column the eye can run down to find the shelters
            with animals, instead of appearing at whatever height each card's
            name happened to end. */}
        <ItemMedia className="justify-between gap-3">
          {/* "wide" rather than "sm": this is the one place the whole set of
              logos is drawn side by side, so it is the one place a wordmark
              shrunk by the plate's width is read against a square logo drawn
              at full height. See SIZE_CLASS. */}
          <ShelterAvatar
            name={shelter.name}
            logo={shelter.logo}
            size="wide"
            track
          />

          {/* Which shelters the census is counting, and with how many animals
              each.

              The site's provider green, the same --filter-accent tokens the
              shelter page's hero avatar and its notice wear, because it is the
              same fact stated in the same place in the visual system: this
              shelter shares its list with us.

              A marker, not a link. The name's stretched ::after already covers
              the card, so a second link here would have to lift itself out of
              it with relative z-10 the way the contact rows do, and it would
              point where the card already points. The paw rather than the
              census line's shield: the plate's green is what says "shares its
              data", so the glyph is free to say what the number counts. */}
          {shelter.animals !== undefined && shelter.animals > 0 && (
            <p className="inline-flex shrink-0 items-center gap-1.5 rounded-ui border border-[var(--filter-accent-border)] bg-[var(--filter-accent)] px-2 py-0.5 text-xs font-medium tabular-nums text-[var(--filter-accent-foreground)]">
              <PawPrint className="size-3 shrink-0" aria-hidden />
              {text.animals(shelter.animals)}
            </p>
          )}
        </ItemMedia>

        <ItemContent>
          {/* Two title lines reserved, but only between sm and xl.

              The contacts below are top-aligned so the rows line up by what
              they are across a grid row (see the footer's comment), and that
              only holds while the blocks above them are the same height. In
              the two-column band the column is narrow enough that the longest
              names wrap: at 768px two of the first row's names take one line
              and one takes two, which pushed that card's phone row 22px below
              its neighbour's. Reserving the second line makes a one-line and a
              two-line name present the same block, so the rows meet again.

              Scoped sm:max-xl: because the band is the only place it is true.
              Below sm there is one column and nothing to line up with, so the
              reserved line would only be a gap under every short name; from xl
              the third column is still wide enough that no name in the
              register wraps, so there is nothing to reserve. The unit is lh,
              the title's own line box, so this stays right if the title's font
              size or leading-snug ever changes. */}
          <ItemTitle asChild className="sm:max-xl:min-h-[2lh]">
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
                //
                // title repeats a value the card usually prints in full. It is
                // there for the one that does not fit: a long address or host
                // truncates to an ellipsis, and without a tooltip the whole
                // value is left only in the aria-label, where a mouse cannot
                // reach it.
                <li>
                  <a
                    href={telHref(shelter.phone)}
                    className={CONTACT_ROW}
                    aria-label={`${text.phone}: ${shelter.phone}`}
                    title={shelter.phone}
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
                    title={shelter.email}
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
                    title={host}
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
