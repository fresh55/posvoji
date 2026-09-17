import {
  ShelterCard,
  type ShelterCardData,
  type ShelterCardText,
} from "@/components/shelter-card";
import { SKIP_LINK } from "@/lib/skip-link";

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
   *  17 items": one word twice inside two announcements, the second of them
   *  spending the reader's attention on nothing new. The region is the copy
   *  that keeps it, because it is the one a reader can jump to from anywhere on
   *  a 6000px page; the list is only ever entered from inside the region that
   *  has just named it, and "list, 17 items" is the whole of what it has left
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
 * A row of town chips stood above the grid below sm for a while, as an index
 * into the one-column list, and it is gone for the same reason. It showed
 * three or four of sixteen towns at a time, so finding one was a sideways
 * scroll and a tap to save a few flicks down a list that is already sorted
 * and says so; it only helped a reader who knew the shelter's town, which
 * the reader looking for Muri or Meli by name does not; and the question it
 * half answered, which shelter is mine, is the lookup button's above. What
 * it cost was 64px of the first phone screen, a second scroll axis and the
 * page's only client boundary. Seventeen cards is eight flicks at worst.
 *
 * So the register is what it always was, a document, and it renders on the
 * server.
 */
export function SheltersAtlas({
  shelters,
  card,
  text,
}: {
  /** In the order the page draws them: by town, then by name. */
  shelters: ShelterCardData[];
  card: ShelterCardText;
  text: SheltersAtlasText;
}) {
  return (
    <section aria-label={text.heading} className="w-full">
      {/* Seventeen name links and about fifty contact links, one tab stop
          each, so without a way past them a keyboard cannot reach the footer. */}
      <a
        href="#za-zavetisci"
        className={SKIP_LINK}
      >
        {text.skip}
      </a>

      <p className="mb-3 text-sm text-muted-foreground">{text.sortNote}</p>

      {/* Cards share their three content tracks so each row stays aligned.
          Keep an explicit list role for browsers that omit it without markers. */}
      <ul role="list" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {shelters.map((shelter) => (
          <ShelterCard key={shelter.id} shelter={shelter} text={card} />
        ))}

      </ul>

      {/* Where the skip link lands. tabIndex so focus actually moves here
          rather than only scrolling the page. */}
      <div id="za-zavetisci" tabIndex={-1} />
    </section>
  );
}
