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
      <div className="flex items-center gap-10">
        <a
          href={homeHref}
          // The primary way home, and the logo drew it 40px tall. The utility
          // grows the tappable box without moving the drawing.
          className="flex max-lg:tap-target items-center gap-2 font-medium tracking-tight"
          aria-label="posvoji.si"
        >
          <Logo className="h-10 w-auto" />
          posvoji.si
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
