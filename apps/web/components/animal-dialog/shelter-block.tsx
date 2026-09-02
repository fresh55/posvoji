"use client";

import { ExternalLink, Heart, Hourglass, Phone } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { ShelterAvatar } from "@/components/shelter-avatar";
import type { AnimalFields } from "@/lib/animal";
import { quotedLang } from "@/lib/i18n";
import { telHref } from "@/lib/contact-links";
import type { ShelterLogos } from "@/lib/shelter-logos";
import { shelterPath } from "@/lib/shelter-path";
import type { ShelterPhones } from "@/lib/shelters";
import { ageLabel, longStayMonths } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

// The logo-or-initial fallback lives in ShelterAvatar so one place decides it.
export function ShelterBlock({
  animal,
  logos,
  phones,
  reference,
  ctaMirrored = false,
  onSeeLongestWaiting,
}: {
  animal: AnimalFields;
  logos: ShelterLogos;
  /** Shelter id to its registry phone, keyed like `logos`. Fifteen of the
   *  seventeen shelters have one; the other two render as they did before. */
  phones: ShelterPhones;
  /** The dataset's own build time, so the wait agrees with the cards. */
  reference: Date;
  /**
   * Re-sorts the list by longest wait and closes the dialog. Absent while
   * that sort is already on, which it is by default, so the link only shows
   * when it would actually change something.
   */
  onSeeLongestWaiting?: () => void;
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
  const phone = phones[shelter.id];

  // The long wait lives here, in the same box as the one button that can
  // answer it, so the plea and the action read as one thought instead of two
  // stacked crates. Who counts as waiting long is labels.ts's decision, the
  // same one the card's mark reads, so the two surfaces cannot drift apart.
  const stayMonths = longStayMonths(animal, reference);
  const stay =
    stayMonths === undefined ? undefined : ageLabel(stayMonths, locale);

  return (
    // A container, so the box can decide from its own width whether the two
    // actions fit beside the shelter's name. The same block is drawn in a
    // 768px dialog and on a page column a third wider, and the viewport says
    // nothing about which one it is in.
    <div data-slot="shelter-block" className="@container/shelter space-y-2">
      <div className="flex flex-wrap items-center gap-3 rounded-ui border bg-muted/40 p-4">
        {stay && (
          <div className="flex w-full items-start gap-2 text-sm">
            <Hourglass
              className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400"
              strokeWidth={1.75}
              aria-hidden
            />
            <div className="space-y-0.5">
              <p className="font-medium">
                {animal.name
                  ? t("longStay", { name: animal.name, duration: stay })
                  : t("longStayUnnamed", { duration: stay })}
              </p>
              {onSeeLongestWaiting && (
                <button
                  type="button"
                  onClick={onSeeLongestWaiting}
                  className="cursor-pointer text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
                >
                  {messages.longStayLink}
                </button>
              )}
            </div>
          </div>
        )}
        <ShelterAvatar name={shelter.name} logo={logos[shelter.id]} />

        <div className="min-w-0 flex-1">
          {/* The name goes to the shelter's own page, which holds its other
              contacts, the občine it answers for and the rest of its animals.
              Until now the only way out of this box left the site. */}
          <p className="truncate font-medium">
            <a
              href={shelterPath(shelter.id, locale)}
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
            call to action gives way to the good news. The phone goes with it:
            this branch is the one place the box has nothing to ask for, and a
            number under "already found a home" invites a call about an animal
            that has left. */}
        {animal.status === "adopted" ? (
          // The listing still has to be reachable: every animal here names
          // its source and links back to it, adopted or not.
          <div className="flex w-full flex-col items-start gap-1.5 sm:w-auto">
            <p className="flex w-full items-center gap-2 rounded-ui border border-[var(--filter-accent-border)] bg-[var(--filter-accent)] px-3 py-2 text-xs text-[var(--filter-accent-foreground)]">
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
          <>
            {/* The mirror only exists where there is a listing to open, so
                this reads the same condition the sticky bar is gated on.
                Without it an animal with no source URL would lose its button
                on the phone rather than have it repeated. The bar's other
                condition is the branch above: an adopted animal never reaches
                this button, and the bar does not draw one for it either. */}
            <Button
              asChild
              size="sm"
              className={cn(
                // max-sm:h-11, because size="sm" is 32px and on the animal's
                // own page, which has no sticky bar to mirror this, it is the
                // button a thumb actually goes for.
                "w-full max-sm:h-11 sm:w-auto",
                ctaMirrored && animal.source.sourceUrl && "max-sm:hidden",
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

            {/* The other half of "how do I get this animal", and until now it
                was on the found-animal page and nowhere near an animal. The
                listing stays the primary; this is the outline beside it,
                because a phone call is what someone does after reading the
                listing rather than instead of it.

                Beside it only where the box is wide enough to hold the name
                as well: two buttons on the shelter's row cost the name its
                width, and in the dialog "Obalno zavetišče (Marjetica Koper)"
                came out as "Obalno zavetišče (Marje...". So the phone takes a
                row of its own under the primary, ranged right so the two
                read as one stack of actions, and moves up beside it from
                @4xl, which the page column clears and the dialog does not.
                Below sm both are full width anyway, as they were.

                No aria-label. The visible label is already the channel and
                the number ("Pokliči 03 749 06 00"), which is the whole of
                what a "Telefon: ..." name would say, and naming it that way
                would drop the visible word from the accessible name, which is
                what WCAG 2.5.3 asks a control not to do. shelter-card.tsx
                needs the label because there the visible text is the bare
                number.

                Not mirrored into the dialog's sticky bar. That bar carries
                the one action the phone must never have to scroll for, and at
                375px a second button beside it either halves the primary or
                adds a second 44px row over the card. The box is a scroll away
                and the number is printed in it. */}
            {phone && (
              <div className="flex w-full sm:justify-end @4xl/shelter:w-auto">
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="w-full max-sm:h-11 sm:w-auto"
                >
                  <a href={telHref(phone)}>
                    <Phone aria-hidden />
                    {t("muniCall", { phone })}
                  </a>
                </Button>
              </div>
            )}
          </>
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
