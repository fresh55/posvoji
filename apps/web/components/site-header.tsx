import { LanguageSwitcher } from "@/components/language-switcher";
import { Logo } from "@/components/logo";
import { ShelterLogin, SiteMenu, SiteNav } from "@/components/site-menu";
import type { Locale } from "@/lib/i18n";

type SiteHeaderProps = {
  homeHref: string;
  /** This page's address in both locales. The language switcher needs the
   *  pair; the nav needs only the current locale's half, to mark the item
   *  that points at the page the reader is already on. Every page that
   *  renders a header already passes this, so the nav gets its answer without
   *  a second prop that could drift out of step with the first. */
  languagePaths?: Record<Locale, string>;
};

export function SiteHeader({ homeHref, languagePaths }: SiteHeaderProps) {
  return (
    <header className="bleed flex items-center justify-between gap-4 border-b py-4">
      {/* Brand and destination together on the left, which is where a nav
          belongs when there is one link in it. Piled on the right with the
          language switcher and the login it read as a fourth control in a row
          of controls, and it left the whole left half of the header empty
          while the right half carried everything. */}
      {/* 40px between the brand and the row, against the row's own 24px. The
          32px here was set when the row held one link and there was no gap
          inside it to out-rank; with two links in the row the group gap has
          to stay the wider of the two or the brand joins the nav. */}
      {/* min-w-0 down the brand, so the wordmark is the thing that gives when
          the row runs out of room.

          Nothing in this header could shrink. At 200% text on a 320px phone,
          which is what WCAG 1.4.4 asks the page to survive, the brand wanted
          237px and the controls beside it 155, and the header pushed the
          document to 460px inside a 320px viewport: the whole site scrolled
          sideways, every page of it. A flex item's automatic minimum is its
          own min-content, and "posvoji.si" has no break in it, so the row had
          no way to be narrower than the word.

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
          href={homeHref}
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
    </header>
  );
}
