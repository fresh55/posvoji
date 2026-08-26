"use client";

import type { MouseEvent } from "react";
import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/lib/i18n";

// No flags. A flag is a country and these are languages, which is a mismatch
// that only ever runs one way in practice: Slovenian is spoken outside
// Slovenia and English is the first language of a dozen countries, none of
// which is picked out by the union jack this used to draw beside it. The name
// is already here in both sizes, and the name is the thing being chosen.
const LANGUAGES = [
  { locale: "sl", href: "/", shortName: "SL", name: "Slovenščina" },
  { locale: "en", href: "/en", shortName: "EN", name: "English" },
] as const;

export function LanguageSwitcher({
  paths,
}: {
  paths?: Partial<Record<Locale, string>>;
}) {
  const { locale, messages } = useI18n();

  const keepFilters = (event: MouseEvent<HTMLAnchorElement>) => {
    event.currentTarget.href = `${event.currentTarget.href}${window.location.search}`;
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
            onClick={keepFilters}
          >
            <span className="sm:hidden">{language.shortName}</span>
            <span className="hidden sm:inline">{language.name}</span>
          </a>
        </Button>
      ))}
    </nav>
  );
}
