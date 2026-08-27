"use client";

import type { MouseEvent } from "react";
import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/lib/i18n";
import { ROUTES, translatePath } from "@/lib/routes";

// No flags. A flag is a country and these are languages, which is a mismatch
// that only ever runs one way in practice: Slovenian is spoken outside
// Slovenia and English is the first language of a dozen countries, none of
// which is picked out by the union jack this used to draw beside it. The name
// is already here in both sizes, and the name is the thing being chosen.
const LANGUAGES = [
  { locale: "sl", href: ROUTES.home.sl, shortName: "SL", name: "Slovenščina" },
  { locale: "en", href: ROUTES.home.en, shortName: "EN", name: "English" },
] as const;

// translatePath and the paired route table it reads live in lib/routes.ts,
// because the header's navigation and half of lib need the same pairs. A page
// mounted with an explicit `paths` prop (animal-page.tsx,
// shelter-detail-page.tsx) already knows its own translation and takes
// priority over that table; it exists for the pages that don't, chiefly the
// index, whose address can move client-side after the server rendered it. The
// animal dialog opens over the animal's own path through history.pushState
// (use-animal-dialog.ts), and SiteHeader is mounted once, before that write
// ever happens. Reading `paths` at render time can't see a change that hasn't
// happened yet; reading the address bar itself when the switcher is actually
// pressed can.

export function LanguageSwitcher({
  paths,
}: {
  paths?: Partial<Record<Locale, string>>;
}) {
  const { locale, messages } = useI18n();

  const navigate = (
    event: MouseEvent<HTMLAnchorElement>,
    target: Locale,
  ) => {
    const path = paths?.[target] ?? translatePath(window.location.pathname, target);
    event.currentTarget.href = `${path}${window.location.search}`;
  };

  return (
    <nav
      aria-label={messages.chooseLanguage}
      className="flex items-center gap-0.5 rounded-ui bg-muted p-0.5"
    >
      {LANGUAGES.map((language) => (
        <Button
          key={language.locale}
          asChild
          size="xs"
          variant="ghost"
          // max-lg:min-h-11 and not max-lg:tap-target. These two sit 2px
          // apart, so the overlay each one laid out to 44px reached across
          // the gap and over its neighbour: measured on a 390px phone, the
          // right edge of SL hit-tested as EN, because EN comes later in the
          // DOM and won. filter-chips.tsx met the same thing and wrote down
          // the same answer: past a certain closeness the control has to
          // grow, not merely claim.
          className={
            locale === language.locale
              ? "rounded-ui bg-background px-2 font-normal text-foreground shadow-sm hover:bg-background max-lg:min-h-11 max-lg:px-3"
              : "rounded-ui px-2 font-normal text-muted-foreground hover:text-foreground max-lg:min-h-11 max-lg:px-3"
          }
        >
          <a
            href={paths?.[language.locale] ?? language.href}
            hrefLang={language.locale}
            lang={language.locale}
            aria-label={language.name}
            aria-current={locale === language.locale ? "page" : undefined}
            onClick={(event) => navigate(event, language.locale)}
          >
            <span className="sm:hidden">{language.shortName}</span>
            <span className="hidden sm:inline">{language.name}</span>
          </a>
        </Button>
      ))}
    </nav>
  );
}
