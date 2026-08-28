import { LanguageSwitcher } from "@/components/language-switcher";
import { Logo } from "@/components/logo";
import { ShelterLogin, SiteMenu, SiteNav } from "@/components/site-menu";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/lib/i18n";

type SiteHeaderProps = {
  githubTitle: string;
  homeHref: string;
  languagePaths?: Record<Locale, string>;
};

export function SiteHeader({
  githubTitle,
  homeHref,
  languagePaths,
}: SiteHeaderProps) {
  return (
    <header className="bleed flex items-center justify-between gap-4 border-b py-4">
      {/* Brand and destination together on the left, which is where a nav
          belongs when there is one link in it. Piled on the right with the
          language switcher and the login it read as a fourth control in a row
          of controls, and it left the whole left half of the header empty
          while the right half carried everything. */}
      <div className="flex items-center gap-8">
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
        <SiteNav />
      </div>
      {/* What is left on the right is the two things addressed to somebody in
          particular - the reader who wants another language, the shelter that
          wants in - and one mark. Exactly one of them is drawn as a box, and
          it is the login: two bordered controls side by side competed, and
          neither looked like the one to press. */}
      <div className="flex items-center gap-3">
        <LanguageSwitcher paths={languagePaths} />
        <Button
          asChild
          variant="ghost"
          size="icon"
          // The words this used to say ("odprta koda, lahko pomagaš") are in
          // the footer now. They were the widest thing in the header and the
          // one thing up there addressed to nobody who came to adopt an
          // animal; the mark alone still says open source to anyone who is
          // looking for it, and the colophon is where the invitation reads
          // as an invitation rather than as navigation.
          className="text-muted-foreground max-lg:tap-target"
        >
          <a
            href="https://github.com/fresh55/posvoji"
            target="_blank"
            rel="noreferrer"
            title={githubTitle}
            // The svg is aria-hidden and there is no longer a label beside
            // it, so without this the accessible name would fall through to
            // the title, which is the joke line and not a name.
            aria-label="GitHub"
          >
            <svg viewBox="0 0 16 16" aria-hidden className="size-4 fill-current">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
            </svg>
          </a>
        </Button>
        <ShelterLogin />
        <SiteMenu />
      </div>
    </header>
  );
}
