import { LanguageSwitcher } from "@/components/language-switcher";
import { Logo } from "@/components/logo";
import { LogoHearts } from "@/components/logo-hearts";
import logoMotion from "@/components/logo-hearts.module.css";
import { ShelterLogin, SiteMenu, SiteNav } from "@/components/site-menu";
import { getMessages, type Locale } from "@/lib/i18n";
import {
  POETIVO_INK,
  POETIVO_MARK,
  POETIVO_TILE,
  POETIVO_TILE_RADIUS,
} from "@/lib/poetivo-mark";
import { homePath } from "@/lib/shelter-path";
import { POETIVO_NAME } from "@/lib/site";
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
    /* What globals.css hangs the band's view-transition-name on, so the
       header stands still while a navigation carries the page under it. A
       class and not an inline style: the name is one half of a contract
       whose other half is a stylesheet rule and a set of pseudo-elements, and
       splitting it across two files would leave neither readable.

       The name has to be unique per document, which is why the stylesheet
       keys on this class rather than on the element: the portal draws a
       header of its own (portal/portal-shell.tsx) and a bare element selector
       would name that one too. site-shell.tsx is the only caller of this
       component, and the demo gate, the error boundaries and the poster
       sheets draw no site chrome at all. */
    <header className="site-header border-b">
    {/* A size container, named so the nav can ask this row how much room it
        has rather than ask the window how wide it is (site-menu.tsx reads it,
        --container-nav-room in globals.css holds the figure).

        The window was the wrong thing to ask. A media query resolves rem
        against the initial font size, so at 200% browser text lg still
        matched a 1024px window, the inline row stayed on in a header that
        could no longer hold it, and "O nas" came to rest under the language
        switcher from 1024 to 1088 with the wordmark truncated away
        altogether. A container query's rem is the root element's real font
        size, so one condition now answers for a narrow window and for large
        text both, and it answers in CSS: nothing measures anything after
        load, so neither shape can flash before the other.

        No loop in it. inline-size containment means this row's width comes
        from the frame above it and never from the nav the query switches, so
        folding the links away cannot widen the row back into holding them. */}
    <div className="@container/header relative mx-auto flex w-full max-w-(--page-max) items-center justify-between gap-4 px-gutter py-4">
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
          // grows the tappable box without moving the drawing. On the pointer,
          // so a touch tablet past lg gets the box too: it hit-tested 40px
          // there while a 1024px mouse window got 44.
          className="flex min-w-0 pointer-coarse:tap-target items-center gap-2 font-medium tracking-tight"
          aria-label="posvoji.si"
        >
          <span className="relative inline-flex h-10 shrink-0">
            <Logo className={`h-full w-auto ${logoMotion.blinkable}`} />
            <LogoHearts />
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="truncate">posvoji.si</span>
            {/* Who builds the site, under its name: "poganja" from the
                catalogue, then Poetivo's mark and its name in the wordmark's
                weight. Bruno wanted it up here beside the logo and not only
                in the footer's small print.

                Text inside the home link and not a link of its own, which is
                the one way it can sit here. A link inside a link is invalid
                HTML, and a second link 12px under this one could not get a
                finger-sized target without taking the lower half of the
                name's presses, which is the collision globals.css records on
                tap-target. The way to poetivo.si stays the footer's credit,
                on every page, with the accessible name this link does not
                carry: aria-label above keeps this link "posvoji.si", so a
                screen reader hears the home link as the home link and meets
                Poetivo once, where it can be followed.

                Two lines inside the 40px the logo already draws: the name's
                24px line and a 12px line holding a 14px mark, 38px in all,
                so the header is no taller than before. The line resets the
                link's weight and tracking and takes the name back for the
                wordmark alone. It never wraps: a second line would push past
                the logo and move the whole header.

                The tile is the brand's colours and not the theme's, and it is
                the one coloured thing in this band. That is the brand's own
                call: the lit window is the mark wherever only a sign fits. */}
            <span
              data-poetivo
              className="inline-flex items-center gap-1 overflow-hidden text-xs leading-none font-normal tracking-normal whitespace-nowrap text-muted-foreground"
            >
              <span className="lowercase">{messages.poweredBy}</span>
              <svg viewBox="0 0 16 16" aria-hidden className="size-3.5 shrink-0">
                <rect
                  width="16"
                  height="16"
                  rx={POETIVO_TILE_RADIUS}
                  fill={POETIVO_TILE}
                />
                <path d={POETIVO_MARK} fill={POETIVO_INK} />
              </svg>
              <span className="font-semibold tracking-[-0.035em]">
                {POETIVO_NAME}
              </span>
            </span>
          </span>
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
