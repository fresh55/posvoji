import { LanguageSwitcher } from "@/components/language-switcher";
import { Logo } from "@/components/logo";
import { ShelterLogin, SiteMenu, SiteNav } from "@/components/site-menu";
import { getMessages, type Locale } from "@/lib/i18n";
import { homePath } from "@/lib/shelter-path";
import { CONTENT_ID, SKIP_LINK_PINNED } from "@/lib/skip-link";

type SiteHeaderProps = {
  /** The language this page is in, and the only thing the header needs to
   *  work out where its own brand points. It used to take that address as a
   *  prop of its own, and every call site passed homePath(locale) or the same
   *  two strings written out by hand: a second prop carrying the first one's
   *  information, which is what the note below argues against. The header
   *  prints a string of its own now as well (the skip link), and that needs
   *  the catalogue, which needs the locale. */
  locale: Locale;
  /** This page's address in both locales. The language switcher needs the
   *  pair; the nav needs only the current locale's half, to mark the item
   *  that points at the page the reader is already on. Optional, and the
   *  switcher falls back to the homepage pair: that is the right answer on
   *  the homepage, which is the one page that leaves it out, and a page with
   *  a twin should pass it rather than send the reader to the root. */
  languagePaths?: Record<Locale, string>;
};

export function SiteHeader({ locale, languagePaths }: SiteHeaderProps) {
  const messages = getMessages(locale);

  return (
    /* The band is the viewport's width and its rule runs edge to edge; the
       row inside it is the page frame, so the brand and the controls line up
       with the main below (site-shell.tsx). It used to bleed out of the
       frame instead, and the rule stopped where the frame did. */
    <header className="border-b">
    <div className="relative mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-gutter py-4">
      {/* The first focusable thing in the document, before the brand. Every
          navigation on this site is a document load, so the chrome's tab
          stops are paid again on every page a keyboard visitor opens rather
          than once per visit, and a shelter page puts up to 186 cards behind
          them. The two bypass links inside the page skip a list; this one
          skips the chrome, which nothing else could.

          relative on the row above, because the link goes absolute on
          focus and an absolutely positioned flex item otherwise resolves
          against the initial containing block and lands on top of the logo.
          left-gutter and not left-0: the row's padding is the page gutter,
          and an absolute child measures from the padding box's edge, so the
          gutter puts the link on the page's own column. */}
      <a
        href={`#${CONTENT_ID}`}
        className={SKIP_LINK_PINNED}
      >
        {messages.skipToContent}
      </a>
      {/* Brand and destination together on the left, which is where a nav
          belongs when there is one link in it. Piled on the right with the
          language switcher and the login it read as a fourth control in a row
          of controls, and it left the whole left half of the header empty
          while the right half carried everything. */}
      {/* 40px between the brand and the row, against the row's own 24px. The
          32px here was set when the row held one link and there was no gap
          inside it to out-rank; with three links in the row the group gap has
          to stay the wider of the two or the brand joins the nav. */}
      {/* min-w-0 down the brand, so the wordmark is the thing that gives when
          the row runs out of room.

          Nothing in this header could shrink. At 200% text on a 320px phone,
          which is what WCAG 1.4.4 asks the page to survive, the brand wanted
          237px and the controls beside it 155, measured while the language
          switcher still drew both of its halves at that width, and the header
          pushed the document to 460px inside a 320px viewport: the whole site
          scrolled sideways, every page of it. A flex item's automatic minimum
          is its own min-content, and "posvoji.si" has no break in it, so the
          row had no way to be narrower than the word.

          The wordmark is the right thing to lose. It is the one part of the
          brand that is also written in the tab title, the one the mark beside
          it already stands for, and the only element in the row that is not a
          control. Truncated it still reads as the brand; the logo, the
          language switcher and the menu have nowhere to go.

          At every size the site is read at today the word fits and nothing
          here draws differently. This is what happens past that point, which
          previously was a horizontal scrollbar. */}
      <div className="flex min-w-0 items-center gap-10">
        <a
          href={homePath(locale)}
          // Named for BackToTop, which sends focus to the top of the document
          // and picks the target off the DOM (back-to-top.tsx). It used to ask
          // for the header's first anchor, which is the skip link above since
          // this header grew one, and focusing that revealed it on every
          // press. An attribute rather than a position, so the next thing
          // added to this row cannot take the focus either.
          data-brand
          // The primary way home, and the logo drew it 40px tall. The utility
          // grows the tappable box without moving the drawing.
          className="flex min-w-0 max-lg:tap-target items-center gap-2 font-medium tracking-tight"
          aria-label="posvoji.si"
        >
          <Logo className="h-10 w-auto shrink-0" />
          <span className="truncate">posvoji.si</span>
        </a>
        <SiteNav paths={languagePaths} />
      </div>
      {/* Everything on the right is addressed to somebody in particular: the
          reader who wants another language, the shelter that wants in, the
          reader who wants the rest of the site. Only the login is drawn as a
          box, so there is no question which one to press. */}
      <div className="flex items-center gap-3">
        <LanguageSwitcher paths={languagePaths} />
        <ShelterLogin />
        <SiteMenu paths={languagePaths} />
      </div>
    </div>
    </header>
  );
}
