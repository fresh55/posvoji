"use client";

import { ExternalLink, Heart, Hourglass } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { ShelterAvatar } from "@/components/shelter-avatar";
import type { AnimalFields } from "@/lib/animal";
import { quotedLang } from "@/lib/i18n";
import type { ShelterLogos } from "@/lib/shelter-logos";
import { shelterPath } from "@/lib/shelter-path";
import { ageLabel, longStayMonths } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

// The logo-or-initial fallback lives in ShelterAvatar so one place decides it.
export function ShelterBlock({
  animal,
  logos,
  reference,
  ctaMirrored = false,
}: {
  animal: AnimalFields;
  logos: ShelterLogos;
  /** The dataset's own build time, so the wait agrees with the cards. */
  reference: Date;
  /**
   * Set when the phone layout repeats this box's call to action somewhere it
   * can always be reached. The dialog's sticky bar does, which left two
   * identical buttons on screen 90px apart, the upper one 32px tall with its
   * middle covered by the lower one. The animal's own page has no such bar
   * and leaves this alone.
   */
  ctaMirrored?: boolean;
}) {
  const { locale, messages, t } = useI18n();
  const { shelter } = animal;

  // The long wait lives here, in the same box as the one button that can
  // answer it, so the plea and the action read as one thought instead of two
  // stacked crates. Who counts as waiting long is labels.ts's decision, the
  // same one the card's mark reads, so the two surfaces cannot drift apart.
  const stayMonths = longStayMonths(animal, reference);
  const stay =
    stayMonths === undefined ? undefined : ageLabel(stayMonths, locale);

  return (
    <div data-slot="shelter-block" className="space-y-2">
      <div className="flex flex-wrap items-center gap-3 rounded-ui border bg-muted/40 p-4">
        {stay && (
          <div className="flex w-full items-start gap-2 text-sm">
            <Hourglass
              className="mt-0.5 size-4 shrink-0 text-warn-mark"
              strokeWidth={1.75}
              aria-hidden
            />
            <p className="font-medium">
              {animal.name
                ? t("longStay", { name: animal.name, duration: stay })
                : t("longStayUnnamed", { duration: stay })}
            </p>
          </div>
        )}
        <ShelterAvatar name={shelter.name} logo={logos[shelter.id]} />

        {/* A floor of 12rem under the name, so a row that cannot hold the
            mark, the name and the button wraps the button under them
            instead of shrinking the name. min-w-0 alone let flex-1 give the
            name up first: in the animal page's 31rem column beside the photo
            it drew "Obalno zavetišč..." with the button still on the line.
            The dialog's card is wide enough to keep one row, and below sm
            the button is already full width on a row of its own. */}
        <div className="min-w-[12rem] flex-1">
          {/* The name goes to the shelter's own page, which holds its other
              contacts, the občine it answers for and the rest of its animals.
              Until now the only way out of this box left the site.

              Two lines below sm, one from sm up. On a 390px phone the box is
              the 12rem floor plus whatever the mark leaves, and "Obalno
              zavetišče (Marjetica Koper)" was cut to "Obalno zavetišče
              (Marjetica..." in the dialog and on the animal page both: the part
              that says which of the two Koper entries this is was the part that
              went. A phone has the vertical room a desktop row does not, and
              the second line costs nothing there because the button below sm is
              already full width on a line of its own. From sm up the button is
              back on this row and one line is what keeps it there.

              The two are spelled as max-sm and sm rather than as truncate with
              a clamp laid over it: truncate carries white-space: nowrap, which
              a line clamp cannot survive, so leaving both on at once would
              depend on which utility the cascade happened to put last.

              title stays, and is what the sm-and-up truncation leaves to read
              without going anywhere. Below sm it is also still the fallback for
              a name long enough to run past two lines.

              The row keeps items-center. The mark is a fixed 48px row and the
              text beside it is now up to three lines on a phone, which a
              centred mark reads as one unit with; from sm up this same row also
              carries the call to action, and items-start would lift that button
              to the top of a row whose name is one line there anyway. */}
          <p className="font-medium max-sm:line-clamp-2 sm:truncate">
            <a
              href={shelterPath(shelter.id, locale)}
              title={shelter.name}
              className="rounded-ui underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring"
            >
              {shelter.name}
            </a>
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {shelter.city}
          </p>
        </div>

        {/* An adopted animal has no listing worth sending anyone to, so the
            call to action gives way to the good news. */}
        {animal.status === "adopted" ? (
          // The listing still has to be reachable: every animal here names
          // its source and links back to it, adopted or not.
          <div className="flex w-full flex-col items-start gap-1.5 sm:w-auto">
            <p className="flex w-full items-center gap-2 rounded-ui border border-brand-border bg-brand px-3 py-2 text-xs text-brand-foreground">
              <Heart className="size-4 shrink-0" aria-hidden />
              {messages.foundHome}
            </p>
            <a
              href={animal.source.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              {messages.viewOriginalListing}
              <ExternalLink className="size-3" aria-hidden />
            </a>
          </div>
        ) : (
          // The mirror is the sticky bar's, and the bar is gated the same
          // way: an adopted animal never reaches this button, and the bar
          // draws none for it either.
          <Button
            asChild
            size="sm"
            className={cn(
              // max-sm:h-11, because size="sm" is 32px and on the animal's
              // own page, which has no sticky bar to mirror this, it is the
              // button a thumb actually goes for.
              "w-full max-sm:h-11 sm:w-auto",
              ctaMirrored && "max-sm:hidden",
            )}
          >
            <a
              href={animal.source.sourceUrl}
              target="_blank"
              rel="noreferrer"
            >
              {messages.viewOriginalListing}
              <ExternalLink aria-hidden />
            </a>
          </Button>
        )}
      </div>

      {/* The attribution stays a footnote under the box. In practice it
          repeats the shelter's name, and inside the box that read as the
          same line printed twice.

          lang, for the same reason the description carries one: the sentence
          is the provider's own Slovenian ("Foto in opis: Zavetišče Test"),
          printed verbatim. See quotedLang in lib/i18n.ts. */}
      <p
        lang={quotedLang("sl", locale)}
        className="text-xs text-muted-foreground"
      >
        {animal.attribution}
      </p>
    </div>
  );
}
