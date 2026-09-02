"use client";

import type { MouseEvent } from "react";
import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

// No flags. A flag is a country and these are languages, which is a mismatch
// that only ever runs one way in practice: Slovenian is spoken outside
// Slovenia and English is the first language of a dozen countries, none of
// which is picked out by the union jack this used to draw beside it. The name
// is already here in both sizes, and the name is the thing being chosen.
// What both halves wear, hoisted out of the ternary that used to spell it
// twice: the two differ only in colour, and the touch floor below is the part
// that must not drift between them.
//
// Grown rather than overlaid with tap-target. These sit 2px apart, so the
// overlay each one lays out to 44px reaches across the gap and over its
// neighbour: measured on a 390px phone, the right edge of SL hit-tested as EN,
// because EN comes later in the DOM and won. That rule is written down once,
// on the tap-target utility in globals.css.
//
// min-w-11 with the height, because 44px is a square and this only ever had
// the one side of it. The label is two characters, so px-3 brought the box to
// 42 and 43: tall enough and a little narrow, which is the half of the rule
// that is easy to miss when the fix is written as a height. Hit-tested at
// 375px, not read off the class.
const SWITCH =
  "rounded-ui px-2 font-normal max-lg:min-h-11 max-lg:min-w-11 max-lg:px-3";

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

  // The filters travel with the language, so the press carries the current
  // query onto the link before the browser follows it. A static export has no
  // server to read the query with, so this cannot be part of the rendered href.
  //
  // Built from the path the link was rendered with and not from the href the
  // last press left on it. A held modifier opens the destination in a new tab
  // and leaves this page mounted with its link rewritten, so an href appended
  // to in place is appended to again on the next press: /en?vrsta=pes became
  // /en?vrsta=pes?vrsta=macka. Rebuilt from the path each time, a press only
  // ever states the query once.
  const keepFilters =
    (path: string) => (event: MouseEvent<HTMLAnchorElement>) => {
      event.currentTarget.href = `${path}${window.location.search}`;
    };

  return (
    <nav
      aria-label={messages.chooseLanguage}
      className="flex items-center gap-0.5 rounded-ui bg-muted p-0.5"
    >
      {LANGUAGES.map((language) => {
        const path = paths?.[language.locale] ?? language.href;
        return (
          <Button
            key={language.locale}
            asChild
            size="xs"
            variant="ghost"
            className={cn(
              SWITCH,
              locale === language.locale
                ? "bg-background text-foreground shadow-sm hover:bg-background"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <a
              href={path}
              hrefLang={language.locale}
              lang={language.locale}
              aria-label={language.name}
              aria-current={locale === language.locale ? "page" : undefined}
              onClick={keepFilters(path)}
            >
              {/* The short name at every width, where the full names used to
                  appear from sm. Spelled out this was 151px of bordered
                  control, the widest thing in the header after the brand, and
                  it was reading as the header's main event next to the login
                  it stood beside. SL and EN are the two abbreviations nobody
                  has to be taught, and the full name is still the accessible
                  name: both are a prefix of the word they stand for, so
                  "click Slovenščina" still lands here. */}
              {language.shortName}
            </a>
          </Button>
        );
      })}
    </nav>
  );
}
