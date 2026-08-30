import {
  ShelterCard,
  type ShelterCardData,
  type ShelterCardText,
} from "@/components/shelter-card";
import { Card } from "@/components/ui/card";

export type SheltersAtlasText = {
  /** The section's own name, carried on the list: the cards' own headings are
   *  the shelter names, which take h3 under the page's h1. */
  heading: string;
  skip: string;
  /** "Razvrščeno po kraju." / "Sorted by town." The grid is ordered by town
   *  and the town is the card's small second line, so on arrival the sequence
   *  reads as no order at all. One line above the list says what it is. */
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

      {/* Directly above the grid and nowhere else: it is a property of the
          list that follows, so it has to be read before the list rather than
          found under it. Small and muted, with no icon and no box, because it
          is a note about the page and not a control on it. */}
      <p className="mb-3 text-sm text-muted-foreground">{text.sortNote}</p>

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
          as eighteen unrelated headings rather than as a list of them. */}
      <ul
        role="list"
        aria-label={text.heading}
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
      >
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
            <li className="row-span-3 flex flex-col gap-2 p-5">
              <h3 className="font-medium">{invite.title}</h3>
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
