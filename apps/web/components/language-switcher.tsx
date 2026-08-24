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
      className="flex items-center gap-0.5 rounded-ui border p-0.5"
    >
      {LANGUAGES.map((language) => (
        <Button
          key={language.locale}
          asChild
          size="xs"
          variant={locale === language.locale ? "default" : "ghost"}
          className="rounded-ui px-2 font-normal max-lg:tap-target"
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
