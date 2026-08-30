import {
  ShelterCard,
  type ShelterCardData,
  type ShelterCardText,
} from "@/components/shelter-card";
import { Card } from "@/components/ui/card";
import { MUTED_LINK } from "@/lib/link-styles";
import { cn } from "@/lib/utils";

/** The invitation cell's anchor, named once because two things point at it:
 *  the cell itself and the mobile-only link above the grid. Not derived from
 *  any copy string, so it survives a rewording in either locale.
 *
 *  Deliberately not "za-zavetisca", which is one letter off the skip link's
 *  landing pad at the foot of this file ("za-zavetisci") and would leave two
 *  anchors on one page that a reader has to spell out to tell apart. */
const INVITE_ID = "ste-zavetisce";

export type SheltersAtlasText = {
  /** The section's accessible name, and the section prints no heading of its
   *  own. The cards' headings are the shelter names and they take h2 directly
   *  under the page's h1 for that reason: with no heading rendered between the
   *  two, a card at h3 skips a level, and on a 6000px page the outline is how
   *  a heading rotor reads the register.
   *
   *  A rendered h2 here was the alternative and it is worse whichever way it is
   *  drawn. Visible, it prints "Zavetišča" a third time inside 100px, under an
   *  h1 reading "Zavetišča po Sloveniji" and above a line reading "Razvrščeno
   *  po kraju.", and it names nothing the h1 has not named, because this
   *  section is the whole of the page's content. sr-only, it puts a heading in
   *  the outline that no sighted reader can find on the page, and it buys one
   *  wrapper heading to step past on the way to the seventeen headings that are
   *  the actual destinations.
   *
   *  So: a name for the landmark rotor, no heading, and the cards at h2. The
   *  three move together, and a card that goes back to h3 reopens the skip.
   *
   *  Printed once, on the section. It was on the list as well, so a reader
   *  arriving at the grid heard "Zavetišča, region" and then "Zavetišča, list,
   *  18 items": one word twice inside two announcements, the second of them
   *  spending the reader's attention on nothing new. The region is the copy
   *  that keeps it, because it is the one a reader can jump to from anywhere on
   *  a 6000px page; the list is only ever entered from inside the region that
   *  has just named it, and "list, 18 items" is the whole of what it has left
   *  to say there. */
  heading: string;
  skip: string;
  /** "Razvrščeno po kraju." / "Sorted by town." The grid is ordered by town,
   *  and the order is not something the cards themselves can state: a reader at
   *  375px sees about one and a half of them, and two towns in sequence do not
   *  teach a rule. Setting the town large enough to scan while scrolling makes
   *  the key legible, which is a different thing from making the order
   *  predictable, so this line stays whatever size the town is drawn at. */
  sortNote: string;
};

/** The invitation, the grid's last cell rather than a banner under it. Every
 *  string it prints, so the page keeps its copy in one object. */
export type SheltersInvite = {
  title: string;
  body: string;
  /** What the header's login does, and does not do, for a shelter we do not
   *  hold yet. This block prints no login of its own; see the cell below. */
  note: string;
  joinLabel: string;
  joinHref: string;
  newWindow: string;
};

/**
 * The register as seventeen cards, and nothing else.
 *
 * No search, no tabs, no filter and no detail pane. Every one of those existed
 * to reach a fact the page was not showing; a card that prints its shelter's
 * mark, name, town, the count of animals a shelter sharing its list holds, and
 * its phone, email and site has nothing left to hide behind a control. The
 * občina coverage is not among them and does not come back: that question is
 * the found-animal lookup's. Seventeen entries is one page. A
 * search box over a list the reader can already see is ceremony, and the one
 * search worth having on this site, the občina lookup, belongs to the
 * found-animal flow that owns that question.
 *
 * That also takes the whole client boundary off this page. It was here for the
 * filter's state; with no filter, the register is what it always was, a
 * document, and it renders on the server.
 */
export function SheltersAtlas({
  shelters,
  card,
  text,
  invite,
}: {
  /** In the order the page draws them: by town, then by name. */
  shelters: ShelterCardData[];
  card: ShelterCardText;
  text: SheltersAtlasText;
  invite?: SheltersInvite;
}) {
  return (
    <section aria-label={text.heading} className="w-full">
      {/* Seventeen name links and about fifty contact links, one tab stop
          each, so without a way past them a keyboard cannot reach the footer. */}
      <a
        href="#za-zavetisci"
        className="sr-only rounded-ui bg-background px-3 py-2 text-sm underline underline-offset-4 focus:not-sr-only focus:absolute focus:z-50 focus:outline-2 focus:outline-offset-2 focus:outline-foreground"
      >
        {text.skip}
      </a>

      {/* The sort note, and beside it the one thing on this page addressed to
          somebody who is not here to read the register.

          The invitation is the grid's eighteenth cell, which is right: it is
          one card among the shelters rather than a banner over them, and the
          comment on that cell argues it at length. On three columns it lands
          in the last visible row. On one column it is about 5,700px down, so
          the only route in for a shelter we do not hold yet sits behind
          seventeen cards of the register, and the header's login is no help to
          them: it only answers an address already on file. So below sm the
          note's own line carries an anchor to the cell, which costs no height
          in a band that at 375px already holds the h1, the lede, the lookup
          button and its sentence, and the census over two lines. It stays
          quieter than that button: whoever has just found a stray outranks
          whoever runs a shelter. invite.title is the label, so no copy string
          is added and SheltersAtlasText is untouched.

          flex-wrap, and the link does not hold its width. The two sit at
          opposite ends of one line wherever both fit, which is every size the
          page is read at; past that the link takes a line of its own rather
          than pushing the row wider than the column. Held rigid at 200% text
          on a 320px phone it wanted 191px against a 288px column and put the
          whole document into a horizontal scroll, which is the failure the
          card's slots had, arriving from the other direction. */}
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4">
        {/* Directly above the grid and nowhere else: it is a property of the
            list that follows, so it has to be read before the list rather
            than found under it. Small and muted, with no icon and no box,
            because it is a note about the page and not a control on it. */}
        <p className="text-sm text-muted-foreground">{text.sortNote}</p>
        {invite && (
          <a
            href={`#${INVITE_ID}`}
            // The site's quiet secondary link, which already carries the
            // tap-target this needs (lib/link-styles.ts). Overlaid rather
            // than grown, because the nearest control is a band above; see
            // the tap-target utility in globals.css for that rule. The
            // standing underline is the one departure: this points into the
            // page rather than out of it, and the sort note beside it is
            // prose, so the link has to read as a link before it is hovered.
            className={cn(MUTED_LINK, "underline sm:hidden")}
          >
            {invite.title}
          </a>
        )}
      </div>

      {/* Two columns from sm and three from xl. The cards carry six or seven
          lines now, so a third column at 1280px still leaves each one a
          readable measure, and seventeen shelters plus the invitation is
          eighteen cells: the last row comes out even at two columns and at
          three.

          The rows are the cards' own sections rather than the cards. Every
          cell spans three implicit rows and the shelter card takes those three
          as its own tracks (Item's subgrid layout), so a row of cards agrees
          section by section: the tallest logo plate sets the first, the longest
          name the second, the longest contact list the third. What used to do
          this was a reserved title line and a cancelled mt-auto on the card,
          each true of the seventeen names in data/shelters.yaml and of nothing
          else. Nothing here is sized in advance now.

          The implicit rows are auto, which is the default and is why no
          grid-auto-rows is spelled out: the tracks are whatever the row's
          contents need.

          Tailwind's preflight strips the marker and WebKit drops the list role
          with it, so role="list" is spelled out: without it this is announced
          as eighteen unrelated headings rather than as a list of them.

          The role and nothing else. The section's aria-label used to be
          repeated here; see SheltersAtlasText.heading for why it is not. */}
      <ul role="list" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {shelters.map((shelter) => (
          <ShelterCard key={shelter.id} shelter={shelter} text={card} />
        ))}

        {/* The eighteenth cell. Below the grid it was the loudest thing on the
            page under the h1 and it sat above the provenance line that is the
            page's actual credential; in the grid it is one card among the
            shelters, which is what it is asking to become.

            row-span-3 and nothing else. It spans the same three rows a card
            does, so the cells beside it keep the rhythm, but it is still a flex
            column inside: it has no media, no title track and no footer, so
            there is nothing here for a subgrid to line up with, and asking for
            one would only pin these three paragraphs to tracks the cards own.

            One thing to know if this block ever grows: an item spanning three
            auto tracks that is taller than all three can hold spreads the
            excess over them, so an invitation taller than every card in its row
            would add air above those cards' logos as well as under their
            contacts. It is shorter than a card with two contact rows today, and
            it should stay that way. */}
        {invite && (
          <Card
            asChild
            className="border-dashed-muted border-dashed bg-transparent shadow-none"
          >
            <li
              id={INVITE_ID}
              // scroll-mt-24, the same offset the shelter cards carry, so an
              // arrival from the anchor above lands with the dashed edge clear
              // of the viewport top rather than flush against it.
              className="row-span-3 flex scroll-mt-24 flex-col gap-2 p-5"
            >
              {/* h2, the rank the shelter names beside it take. The outline
                  has to say what the layout says: after seventeen h2s an h3
                  here reads as a subsection of the last shelter, which is the
                  one thing this cell is not. Preflight leaves a heading at the
                  inherited size, so the rank changes and the drawing does
                  not. */}
              <h2 className="font-medium">{invite.title}</h2>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {invite.body}
              </p>
              {/* No login button here. The header carries one in the corner a
                  login is looked for, at every width, and printing a second
                  copy of it inside the grid said the same thing twice to the
                  handful of people it is for.

                  What this block owes a shelter is the thing the header
                  cannot give: the way in for one we do not hold yet. The
                  login is a magic link to an address already on file, so a
                  new shelter pressing it gets an email that never arrives and
                  no explanation.

                  It follows the body rather than sitting on the cell's bottom
                  edge: the invitation is two paragraphs of one thought, and
                  mt-auto opened a band of blank between them as wide as the
                  tallest card in the row. */}
              <p className="text-sm leading-relaxed text-muted-foreground">
                {invite.note}{" "}
                <a
                  href={invite.joinHref}
                  target="_blank"
                  rel="noreferrer"
                  className="relative z-10 underline underline-offset-4 hover:text-foreground"
                >
                  {invite.joinLabel}
                  <span className="sr-only"> {invite.newWindow}</span>
                </a>
                .
              </p>
            </li>
          </Card>
        )}
      </ul>

      {/* Where the skip link lands. tabIndex so focus actually moves here
          rather than only scrolling the page. */}
      <div id="za-zavetisci" tabIndex={-1} />
    </section>
  );
}
