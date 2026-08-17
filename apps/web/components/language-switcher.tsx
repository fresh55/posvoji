"use client";

import type { MouseEvent } from "react";
import Image from "next/image";
import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/lib/i18n";

const LANGUAGES = [
  {
    locale: "sl",
    href: "/",
    shortName: "SL",
    name: "Slovenščina",
    flag: "/flags/si.svg",
  },
  {
    locale: "en",
    href: "/en",
    shortName: "EN",
    name: "English",
    flag: "/flags/gb.svg",
  },
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
          className="rounded-ui px-2 font-normal"
        >
          <a
            href={paths?.[language.locale] ?? language.href}
            hrefLang={language.locale}
            lang={language.locale}
            aria-label={language.name}
            aria-current={locale === language.locale ? "page" : undefined}
            onClick={keepFilters}
          >
            <Image
              src={language.flag}
              alt=""
              width={16}
              height={12}
              aria-hidden
              className="h-3 w-4 rounded-[1px] object-cover ring-1 ring-foreground/15"
            />
            <span className="sm:hidden">{language.shortName}</span>
            <span className="hidden sm:inline">{language.name}</span>
          </a>
        </Button>
      ))}
    </nav>
  );
}
