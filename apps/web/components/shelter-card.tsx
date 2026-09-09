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
import { publishedCount } from "@/lib/shelter-census";
import type { ShelterLogo } from "@/lib/shelter-logos";
import { shelterAnchorId } from "@/lib/shelter-path";

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
  /** "Brez objav" / "No listings", for a shelter the
   *  register lists but whose list we do not publish.
   *
   *  The card used to print nothing at all in that slot, on the reasoning
   *  next to `animals` below: a zero here would read as a shelter holding no
   *  animals rather than as a shelter we publish nothing for. That reasoning
   *  still holds and this is the same sentence finished. Printing nothing
   *  makes the reader supply the missing half themselves, and six of the
   *  seventeen cards are the count-less kind, so the page hands out six
   *  blanks and no key to them. The census line above the grid says how many
   *  shelters share a list; only the card can say which ones do not. */
  noAnimals: string;
};

// Every contact sits under the name's stretched ::after, which covers the whole
// card, so each needs relative + z-10 to take its own presses.
//
// data-contact on each row is a test contract, not decoration: the e2e suite
// selects on roles and data attributes and never on classes, and the alignment
// spec has to be able to ask for the phone row of one card and the phone row
// of its neighbour. Nothing in the app reads it, so it looks unused. It is not.
//
// A row, not an icon. Behind a 24px glyph the number lived only in an
// aria-label, so a desktop reader who had just found a stray could see that a
// shelter had a phone and never what it was. min-h-9 is a real target for a
// pointer without the 44px a bare icon needed, because the row is the target.
//
// A thumb is not a pointer, and that is where the reasoning above stops. 36px
// clears WCAG 2.5.8 AA and sits under both platform minimums, on the control
// this page exists for: three destinations 38px apart (tel:, mailto:, and a
// site that leaves us), stacked inside a card whose name stretches an ::after
// over the whole box as a fourth. Missing the phone by a few pixels opens a
// mail composer or walks to the shelter's page, and nothing says so happened.
//
// So the row is drawn at 44px for a coarse pointer, and the question is asked
// of the pointer rather than of the viewport, which is the idiom
// components/animal-dialog/animal-dialog.tsx already uses for its nav arrows.
// The argument for asking it that way, and the list of call sites still asking
// about width instead, are with the tap-target utility in globals.css, where
// the rest of this rule lives.
//
// Grown rather than overlaid with tap-target, because the rows sit against
// each other; the tap-target utility in globals.css carries that rule. The
// card is free to be taller: below sm the grid is one column, so no neighbour
// holds it to a height.
const CONTACT_ROW =
  "relative z-10 flex min-h-9 pointer-coarse:min-h-11 items-center gap-2.5 rounded-ui text-sm text-muted-foreground underline-offset-4 outline-hidden hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring";

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
 * The logo sits on its own line rather than beside the name. Beside it, eleven
 * wordmarks running from square to five times as wide started every name at a
 * different x; on a line of its own, each one can keep its own proportions
 * inside a fixed row and no neighbouring line has to agree with it.
 *
 * From sm up the card is laid out on the grid row's own tracks (Item's subgrid
 * layout), so its three sections are as tall as the tallest of that section
 * across the row: the logos on one line, the contacts starting on one line.
 * That is structural, and it holds for a name of any length and for a section
 * that grows for a reason nobody has thought of yet.
 *
 * Below sm there is no row to agree with. The grid is one column, every card
 * is alone on its line, and a subgrid with nothing to align to is three auto
 * tracks in a trenchcoat. So the card is a flex column there, and being a flex
 * column is what lets the sections be reordered: the name and the town first,
 * the mark and the count under them, the contacts last. The logo band was the
 * card's header and on a phone that meant the first thing on a card about a
 * shelter's name was not the name. Measured at 375: the name is the first
 * line, and every count pill still lands 95px down its card, which keeps it in
 * the same glance. At 320 the one name that wraps pushes its pill to 120.
 *
 * What the reorder costs is the counts sitting at one offset on every card.
 * See the ItemMedia comment below.
 */
export function ShelterCard({
  shelter,
  text,
}: {
  shelter: ShelterCardData;
  text: ShelterCardText;
}) {
  const host = shelter.website ? websiteLabel(shelter.website) : undefined;
  // never-print-a-zero, from lib/shelter-census.ts, which owns the rule for
  // every surface that draws this count. One optional number rather than a
  // boolean beside the original field, because the mark and the count pill
  // have to be drawn on the same test and the pill still needs the number.
  const animals = publishedCount(shelter.animals);

  return (
    <Item asChild variant="outline" layout="subgrid">
      <li
        id={shelterAnchorId(shelter.id)}
        // relative, because the name's anchor stretches an ::after over this
        // whole box: the card is clickable without being one giant <a> whose
        // accessible name is every word printed on it.
        //
        // Tighter on a phone: 16px of padding instead of Item's 20px, and 12px
        // between the three sections instead of the layout's 16px. Both come
        // through this className, which cn merges after Item's own p-5 and the
        // subgrid layout's gap-4, so the phone values win where they apply and
        // nothing from sm up is touched.
        //
        // 14px comes off each card. Seventeen of them in one column is a
        // screen and a half of scrolling saved on the page a reader travels
        // rather than scans, and none of it is taken from anything printed:
        // the text is larger here than it was, not smaller.
        className="group relative scroll-mt-24 max-sm:flex max-sm:flex-col max-sm:gap-3 max-sm:p-4 transition-[border-color,box-shadow] hover:border-foreground/40 hover:shadow-sm focus-within:border-foreground/40 focus-within:shadow-sm has-[[data-card-link]:focus-visible]:border-ring has-[[data-card-link]:focus-visible]:ring-3 has-[[data-card-link]:focus-visible]:ring-ring"
      >
        {/* The mark on the left, the count on the right, on one line of their
            own: above the name from sm up, under the name and its town below
            it.

            The count sits here rather than under the town, where it began,
            because it is the one thing on the card that only some shelters
            have. Under the town it was part of the text stack, so the eleven
            cards carrying it pushed their contacts a line below the six that
            do not: at 1440px the first row's phones sat at 575, 603 and 575.
            The subgrid would line those rows up now whatever the count did to
            them, but it would do it by growing the content track on every card
            in the row, which is a band of air under the six shorter names to
            pay for a line on the eleven. Up here it shares a row every card
            draws at the row's fixed height whatever else is true, and costs
            nothing.

            It reads better for the scan, too. Ranged right on a fixed row, the
            counts form a column the eye can run down to find the shelters
            with animals, instead of appearing at whatever height each card's
            name happened to end.

            That last part is what the phone order gives up, and it is worth
            saying plainly: below sm the row sits under the name, so a card
            whose name takes two lines carries its count 25px lower than its
            neighbour's. Measured over the eleven cards that have a count: at
            375 all eleven sit at 95px, and at 320 ten of them do and Obalno
            zavetišče, the one name that wraps there, sits at 120. The counts
            are still ranged right and still on a line of their own, so the
            eye has an edge to run down; what it no longer has is one y. Paid
            for the name reaching the reader first, which is the thing the
            page is a list of. */}
        <ItemMedia className="justify-between gap-3">
          {/* "register" rather than "sm": this is the one place the whole set
              of logos is drawn side by side, so it is the one place one mark's
              drawn size is read against another's. See WIDTH_FALLOFF.

              The mark sits on the card rather than in a plate, and the fixed
              row it is centred in is what holds the grid together: whatever
              shape the mark turns out to be, the row below it starts at the
              same y on every card. */}
          <ShelterAvatar
            name={shelter.name}
            logo={shelter.logo}
            size="register"
            // The same test the count pill below is drawn on, so the two can
            // never disagree: green is one statement on this site, and a ring
            // wearing it on a shelter with no list would be making it falsely.
            // No shelter in the register is both logo-less and a data
            // provider today, so this draws nothing yet; it is here so that
            // the first one to grant us a list is coloured by the rule rather
            // than by a later patch.
            accent={animals !== undefined}
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
              census line's shield: the pill's green is what says "shares its
              data", so the glyph is free to say what the number counts. */}
          {/* The other half of the same statement, drawn in the same slot on
              the same fixed row, so the column of counts the eye runs down
              has no holes in it: every card answers "does this one share a
              list", and the six that do not say so in words.

              Muted text and no pill. The pill's green is the site's one
              statement that a shelter shares its data, and a bordered chip
              wearing the negative would answer the scan just as loudly as the
              positive it is the absence of. This is the quiet fact under the
              loud one, which is what it is. */}
          {animals === undefined && (
            // data-no-list and not data-animals="none": the browser suite
            // adds every data-animals up against the census line, and a word
            // in that column is a sum that is not a number.
            <p
              data-no-list
              className="min-w-0 text-right text-xs text-muted-foreground"
            >
              {text.noAnimals}
            </p>
          )}
          {animals !== undefined && (
            // data-animals is a test contract, the same as data-contact on
            // the rows below: the census line above the grid states how many
            // shelters share a list and how many animals they hold, and the
            // only way to check the page agrees with itself is to add these
            // up. The number rather than the label, because Slovenian agrees
            // the noun with it and a test should not be parsing the dual.
            <p
              data-animals={animals}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-ui border border-[var(--filter-accent-border)] bg-[var(--filter-accent)] px-2 py-0.5 text-xs font-medium tabular-nums text-[var(--filter-accent-foreground)]"
            >
              <PawPrint className="size-3 shrink-0" aria-hidden />
              {text.animals(animals)}
            </p>
          )}
        </ItemMedia>

        {/* One order utility, not three. The phone order differs from the
            source order by a single move, the content going to the front, and
            order-first says exactly that while the media and the footer keep
            their own sequence at the default 0. The DOM order is left as it
            is: the source order is the one the subgrid band draws and the one
            a reader without CSS gets. See the phone paragraph on ShelterCard.

            The usual objection to order is that it walks the keyboard through
            a card in one sequence and the eye through it in another. It does
            not here, because the media row holds nothing focusable: the mark
            is decoration with an empty alt and the count is a paragraph. The
            two things that take focus are the name and the contact rows, and
            they are first and last in both orders. */}
        <ItemContent className="max-sm:order-first">
          {/* No reserved second line here any more.

              A sm:max-xl:min-h-[2lh] used to sit on this title, because in the
              two-column band the longest names wrap and a two-line name pushed
              its own contacts 22px below its neighbour's. Reserving a line made
              the two present the same block. It held only while no name took
              three, and a name long enough to take three is one row of
              data/shelters.yaml away: the same measurement with a name that
              wraps twice puts the phone rows 115px apart again, and nothing
              says so.

              The content track is the reservation now, and it is as tall as
              the tallest title in the row whether that is one line or four.
              Below sm there is no row and no track, and none is wanted: a
              card alone in a one-column list has nothing to present the same
              block as.

              The town stays with the name rather than with the track: where a
              neighbour's name takes an extra line, the slack falls under the
              pair and not between them. Lining the towns up too would want a
              track of their own and would open a gap between a name and its
              own town, which reads worse than a small line sitting a little
              higher on one card than the next. */}
          {/* h2, because the section that holds these cards prints no
              heading of its own. The decision and its consequences live with
              that aria-label, on SheltersAtlasText.heading. */}
          {/* 18px below sm, 16px from sm up.

              The name is what a reader is looking for on this page, and on a
              phone it was the same 16px as the body of every other page under
              a 64px band of logo: the mark was the loudest thing on a card
              about a shelter's name. From sm up the card is one of two or
              three side by side and the grid itself carries the scan, so
              nothing above the breakpoint moves.

              text-pretty over ItemTitle's own text-balance. Balance is the
              right rule for a two-line heading with room to spare, and this
              is neither: browsers stop balancing at about six lines, and the
              longest names at 320px take four or five short ragged ones
              before the cap even comes up. Pretty leaves the line breaks
              alone and only keeps the last line off a single word. */}
          <ItemTitle asChild className="text-pretty max-sm:text-lg">
            <h2>
              <a
                href={shelter.href}
                data-card-link
                className="underline-offset-4 outline-hidden after:absolute after:inset-0 after:rounded-ui group-hover:underline"
              >
                {shelter.name}
              </a>
            </h2>
          </ItemTitle>
          {/* The town at 14px below sm, which is the sort key drawn large
              enough to be read while scrolling.

              The grid is ordered by town and says so above itself, but below
              sm it is one column seventeen cards deep and the reader sees
              about one and a half of them at a time. At 12px muted, under the
              name, the one line that carries the ordering was the quietest
              thing on the card, so the sequence read as no order at all and
              there was no way to look for a particular shelter. The name is
              18px below sm now, which widens that distance rather than
              closing it, so the 14px here has only got more necessary.

              sm exactly, because that is where the grid becomes two columns
              (sm:grid-cols-2). Above it the register is scanned as a grid
              rather than travelled through, the town is next to its neighbours
              rather than a screen away from them, and every measurement in the
              comments on this file was taken at 12px. Nothing above the
              breakpoint changes.

              The glyph goes with the size. Every contact row on this card
              pairs text-sm with size-3.5, and a 12px pin beside 14px text
              would be the one place the card paired them differently.

              ItemDescription's own base is text-xs, and tailwind-merge keeps
              the later of two sizes in the same group: the unprefixed text-sm
              wins here, while sm:text-xs is a different modifier and
              survives. */}
          <ItemDescription className="flex items-center gap-1 text-sm sm:text-xs">
            <MapPin className="size-3.5 shrink-0 sm:size-3" aria-hidden />
            <span className="truncate">{shelter.city}</span>
          </ItemDescription>
        </ItemContent>

        {/* From sm up the contacts sit in the row's third track, which is as
            tall as the longest contact list in the row and starts at one y
            across it. The slack a short list has left over falls to the bottom
            of the card, where nothing is printed, rather than pushing its one
            row down to sit level with a neighbour's last one. Item's subgrid
            layout is what zeroes the mt-auto that would otherwise do exactly
            that, and it zeroes it in the phone column too, where a footer
            pushed to the bottom edge would open a hole under the contacts of
            every card with fewer than three.

            What lines up is the position in the list, not the channel. The
            three rows are always drawn in this order, so where two cards hold
            the same channels a phone reads across from a phone; where one is
            missing a channel the ones below it move up a row, and Zavetišče
            Johanca, which holds only an email, prints it across from its
            neighbours' phones. Fixing that would mean a track per channel and a
            blank row printed on every card that lacks one, which is a hole in
            the card to buy an alignment nobody reading one card can see.

            The footer is drawn whether or not there is anything to put in it.
            Every one of the seventeen shelters holds a phone, an email or a
            site today, so the empty case is unreachable from data/shelters.yaml
            as it stands; a card that skipped the slot would still have to span
            the track, and a card that renders an empty one does that without
            being asked to remember. */}
        {shelter.phone || shelter.email || shelter.website ? (
          <ItemFooter asChild>
            {/* gap-0.5 for a pointer, none at all for a thumb. Nothing is
                drawn at a row's edge, so what is read here is the space
                between two lines of text, and that is 18px at a 36px row: the
                rows separate on their own and widening the gap would only buy
                air the card pays for in height.

                On touch the 2px is worse than nothing. The 44px rows are the
                only targets on the card that are not the card, and the band
                between two of them is not a miss that lands nowhere, it is a
                miss that falls through to the name's stretched ::after and
                walks to the shelter's page. Hit-tested at that band: it
                returns the card link. Closed up, the rows tile, and a press
                that misses the phone by two pixels opens the mail composer
                instead, which is at least a contact the reader can see they
                got. */}
            <ul className="gap-0.5 pointer-coarse:gap-0">
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
                    data-contact="phone"
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
                    data-contact="email"
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
                    data-contact="website"
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
        ) : (
          <ItemFooter />
        )}
      </li>
    </Item>
  );
}
