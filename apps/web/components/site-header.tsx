import { LanguageSwitcher } from "@/components/language-switcher";
import { Logo } from "@/components/logo";
import { SiteMenu, SiteNav } from "@/components/site-menu";
import type { Locale } from "@/lib/i18n";

type SiteHeaderProps = {
  githubTitle: string;
  openSource: string;
  canHelp: string;
  homeHref: string;
  languagePaths?: Record<Locale, string>;
};

export function SiteHeader({
  githubTitle,
  openSource,
  canHelp,
  homeHref,
  languagePaths,
}: SiteHeaderProps) {
  return (
    <header className="bleed flex items-center justify-between border-b py-4">
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
      <div className="flex items-center gap-3">
        {/* Destinations first, meta controls after: what the site has to
            offer stands ahead of the knobs for reading it. */}
        <SiteNav />
        <LanguageSwitcher paths={languagePaths} />
        <a
          href="https://github.com/fresh55/posvoji"
          target="_blank"
          rel="noreferrer"
          title={githubTitle}
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
            {openSource}
            <span className="hidden md:inline">{canHelp}</span>
          </span>
        </a>
        <SiteMenu />
      </div>
    </header>
  );
}
