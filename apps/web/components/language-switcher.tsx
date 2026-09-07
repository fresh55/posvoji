"use client";

import type { MouseEvent } from "react";
import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

// Below lg only the other language is drawn. Both halves and the well around
// them measured 96x48 in a 390px header, beside a 119x40 brand and a 36px
// menu: the heaviest thing in the row, and the 48px well was what set that
// header to 81px where the desktop one is 73. The half the reader is already
// on is the half that can go, because it is the one press that does nothing.
// It stays in the DOM carrying aria-current, hidden below lg, so the well and
// the raised half it stands in are both lg-only and the phone is left with a
// single quiet button.
//
// No flags. A flag is a country and these are languages, which is a mismatch
// that only ever runs one way in practice: Slovenian is spoken outside
// Slovenia and English is the first language of a dozen countries, none of
// which is picked out by the union jack this used to draw beside it. The name
// is already here in both sizes, and the name is the thing being chosen.
// What each half wears, hoisted out of the ternary that used to spell it
// twice: the two differ only in colour, and the touch floor below is the part
// that must not drift between them.
//
// Grown rather than overlaid with tap-target. The halves sat 2px apart, so
// the overlay each one lays out to 44px reached across the gap and over its
// neighbour: measured on a 390px phone, the right edge of SL hit-tested as EN,
// because EN comes later in the DOM and won. That rule is written down once,
// on the tap-target utility in globals.css. Below lg there is one button now,
// and the rule's own test is whether a neighbour sits inside the overhang: the
// menu button is 12px away and carries a 4px overhang of its own, so an
// overlay here would meet it exactly, abutting rather than overlapping. That
// is the one case the rule does not settle, so the box stays the grown one and
// no hit test here changes.
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
      // The well is what carries two halves, so it arrives with the second
      // one. Below lg there is nothing to hold apart and nothing to sit
      // behind: a ghost button on the header's own background.
      className="flex items-center gap-0.5 lg:rounded-ui lg:bg-muted lg:p-0.5"
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
                ? // Hidden below lg, and everything that raises it out of the
                  // well is written at lg with it, so none of it can paint on
                  // a width where the well is not there to raise it out of.
                  // No text colour: this half is the page's own foreground and
                  // inherits it, where the other half spends a class muting
                  // itself. The hover keeps its lg prefix because ghost's own
                  // dark:hover rule would otherwise outrank an unprefixed one.
                  "max-lg:hidden lg:bg-background lg:shadow-sm lg:hover:bg-background"
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
