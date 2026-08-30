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
 * number, address, site, animal count and how many občine it answers for has
 * nothing left to hide behind a control. Seventeen entries is one page. A
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
          three. items-stretch is the default and kept, so every card in a row
          draws the same box; what the cards put inside that box is their own,
          and the register's card top-aligns its contacts rather than pushing
          them to the bottom edge (see shelter-card.tsx).

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
            shelters, which is what it is asking to become. */}
        {invite && (
          <Card
            asChild
            className="border-dashed-muted border-dashed bg-transparent shadow-none"
          >
            <li className="flex flex-col gap-2 p-5">
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
