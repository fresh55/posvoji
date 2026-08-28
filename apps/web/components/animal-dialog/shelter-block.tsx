"use client";

import { ExternalLink, Heart, Hourglass } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { ShelterAvatar } from "@/components/shelter-avatar";
import type { AnimalFields } from "@/lib/animal";
import type { ShelterLogos } from "@/lib/shelter-logos";
import { ageLabel, longStayMonths } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

// The logo-or-initial fallback lives in ShelterAvatar so one place decides it.
export function ShelterBlock({
  animal,
  logos,
  reference,
  ctaMirrored = false,
  onSeeLongestWaiting,
}: {
  animal: AnimalFields;
  logos: ShelterLogos;
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
          <p className="truncate font-medium">{shelter.name}</p>
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
          // The mirror only exists where there is a listing to open, so this
          // reads the same condition the sticky bar is gated on. Without it an
          // animal with no source URL would lose its button on the phone
          // rather than have it repeated.
          <Button
            asChild
            size="sm"
            className={cn(
              // max-sm:h-11, because size="sm" is 32px and on the animal's own
              // page, which has no sticky bar to mirror this, it is the button
              // a thumb actually goes for.
              "w-full max-sm:h-11 sm:w-auto",
              ctaMirrored && animal.source.sourceUrl && "max-sm:hidden",
            )}
          >
            <a href={animal.source.sourceUrl} target="_blank" rel="noreferrer">
              {messages.viewOriginalListing}
              <ExternalLink aria-hidden />
            </a>
          </Button>
        )}
      </div>

      {/* The attribution stays a footnote under the box. In practice it
          repeats the shelter's name, and inside the box that read as the
          same line printed twice. */}
      <p className="text-xs text-muted-foreground">{animal.attribution}</p>
    </div>
  );
}
