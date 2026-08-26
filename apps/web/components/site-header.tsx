import { LanguageSwitcher } from "@/components/language-switcher";
import { Logo } from "@/components/logo";
import { isUnder, NAV_ROUTES } from "@/components/site-routes";
import { getMessages, type Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type SiteHeaderProps = {
  locale: Locale;
  homeHref: string;
  languagePaths?: Record<Locale, string>;
};

export function SiteHeader({
  locale,
  homeHref,
  languagePaths,
}: SiteHeaderProps) {
  const messages = getMessages(locale);
  // The page this header sits on, taken from the path it already hands the
  // language switcher. Every page but the homepage passes one, and the
  // homepage is not in the navigation, so nothing needs a second prop that
  // says the same thing twice. A page below a section marks that section:
  // /zavetisca/<id> marks Zavetišča, /najdena-zival/<obcina> marks Najdena
  // žival.
  const here = languagePaths?.[locale];

  return (
    <header className="bleed flex items-center justify-between gap-4 border-b py-4">
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
      <div className="flex items-center gap-3 md:gap-4">
        {/* Wayfinding at the top of the page, which the site had nowhere but
            the footer. Plain text at the density the rest of the small-link
            grammar uses: no icons, no buttons, and the current section marked
            by ink alone.

            Hidden below md, where the row already holds the logo, the
            language switcher and the GitHub link. The footer carries the same
            three destinations at every width, so a phone loses nothing here.
            The GitHub line's tail gives way a breakpoint later than it used
            to, which is what makes the three links fit at md. */}
        <nav
          aria-label={messages.mainNavigation}
          className="hidden items-center gap-4 text-sm md:flex"
        >
          {NAV_ROUTES.map(({ paths, label }) => {
            const href = paths[locale];
            const current = here ? isUnder(here, paths[locale]) : false;
            return (
              <a
                key={href}
                href={href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "transition-colors hover:text-foreground max-lg:tap-target",
                  current ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {messages[label]}
              </a>
            );
          })}
        </nav>
        <LanguageSwitcher paths={languagePaths} />
        <a
          href="https://github.com/fresh55/posvoji"
          target="_blank"
          rel="noreferrer"
          title={messages.githubTitle}
          // The visible label is hidden below sm and the svg is aria-hidden,
          // so without this the accessible name fell through to the title -
          // the joke line, not a name. This wins the accname computation at
          // every breakpoint, which is fine: "GitHub" is the right name
          // regardless of width, and the joke still shows as the tooltip.
          aria-label="GitHub"
          className="flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground max-lg:tap-target"
        >
          <svg viewBox="0 0 16 16" aria-hidden className="size-4 fill-current">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
          </svg>
          <span className="hidden sm:inline">
            {messages.openSource}
            <span className="hidden lg:inline">{messages.canHelp}</span>
          </span>
        </a>
      </div>
    </header>
  );
}
