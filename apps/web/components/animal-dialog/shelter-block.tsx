"use client";

import { CalendarClock, ExternalLink, Heart, Hourglass } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { ShelterAvatar } from "@/components/shelter-avatar";
import type { AnimalFields } from "@/lib/animal";
import type { ShelterLogos } from "@/lib/shelter-logos";
import { shelterPath } from "@/lib/shelter-path";
import { stayStatement } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { SourceFreshness } from "@/components/source-freshness";

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
  const { locale, messages } = useI18n();
  const { shelter } = animal;

  // The wait lives here, in the same box as the one button that can answer
  // it, and it lives here for every animal still in the shelter. It used to
  // stand under the description as a quiet aside and jump into this box only
  // once it turned into the plea, so a reader who learned where the number
  // was on one animal did not find it there on the next. Now the place is
  // fixed and the ink says how long is long. What it says and how loudly is
  // stayStatement's decision in labels.ts, which the poster reads too, so no
  // two surfaces can drift apart; this box only dresses the answer.
  const stay = stayStatement(animal, locale, reference);
  const plea = stay?.tone === "plea";
  const StayMark = plea ? Hourglass : CalendarClock;

  return (
    <div data-slot="shelter-block" className="space-y-2">
      <div className="flex flex-wrap items-center gap-3 rounded-ui border bg-muted/40 p-4">
        {/* One slot, two tones. The quiet line is a label in the box's muted
            ink, the same size as the plea so the slot does not shrink and grow
            between animals; the plea is full ink and medium weight, and the
            warn-coloured hourglass is the card's mark again. Text, not a pill,
            so "2 leti" here cannot be confused with the age fact above.

            data-tone is what the tests read. A tone is the thing being
            promised, and asserting the Tailwind classes instead pinned this
            slot's dress to every future design pass. */}
        {stay && (
          <div
            data-tone={stay.tone}
            className={cn(
              "flex w-full items-start gap-2 text-sm",
              plea ? "font-medium" : "text-muted-foreground",
            )}
          >
            <StayMark
              className={cn(
                "mt-0.5 size-4 shrink-0",
                plea ? "text-warn-mark" : "opacity-70",
              )}
              strokeWidth={1.75}
              aria-hidden
            />
            <p>{stay.text}</p>
          </div>
        )}
        <ShelterAvatar name={shelter.name} logo={logos[shelter.id]} />

        {/* A floor of 12rem under the name, so a row that cannot hold the
            mark, the name and the button wraps the button under them
            instead of shrinking the name. min-w-0 alone let flex-1 give the
            name up first: in the animal page's 31rem column beside the photo
            it drew "Obalno zavetišč..." with the button still on the line.
            The dialog's card is wide enough to keep one row, and below sm
            the button is already full width on a row of its own.

            Capped at the row's own width, because the floor is written in rem
            and somebody reading at 200% has a 24rem one: at 390 that was
            384px of floor inside a 326px card, and the page scrolled
            sideways. At any font the floor fits in, it is the same 12rem it
            always was. */}
        <div className="min-w-[min(12rem,100%)] flex-1">
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
          {/* The row grows for a finger and the link fills it. tap-target on
              the link itself draws its overlay inside this paragraph, which
              clips at its own box on both sides of sm (line-clamp and truncate
              are each overflow: hidden), so the overlay measured 21px and not
              44; the padding is what the overlay then has to fill. The 14px a
              side is a 17px line of text taken to 45. The town's line under
              this one is inert text, and it stays where it is. */}
          <p className="relative font-medium max-sm:line-clamp-2 sm:truncate pointer-coarse:py-3">
            <a
              href={shelterPath(shelter.id, locale)}
              title={shelter.name}
              className="rounded-ui underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring pointer-coarse:after:absolute pointer-coarse:after:inset-0 pointer-coarse:after:rounded-ui"
            >
              {shelter.name}
            </a>
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {shelter.city}
          </p>
          {/* No number here. The shelter page the name above links to holds
              its phone, mail and site, and adoption starts with the shelter's
              own form rather than with a call, so a number beside one animal
              invited the call shelters ask people not to make. The printed
              poster keeps it: paper carries no links. */}
        </div>

        {/* An adopted animal has no listing worth sending anyone to, so the
            call to action gives way to the good news. */}
        {animal.status === "adopted" ? (
          // The listing still has to be reachable: every animal here names
          // its source and links back to it, adopted or not.
          <div className="flex w-full flex-col items-start gap-1.5 sm:w-auto">
            {/* The same tokens the status badge on the title row wears for
                this animal (the quiet badge variant), because the two print
                the same fact and the reader sees them at once. The brand
                green it used to carry is the mark for a shelter that shares
                its data, for a chosen answer and for the health record, not
                for an outcome, so a green box here read as a fourth meaning
                and outshouted the grey badge saying the same thing.

                The heart stays: it is what keeps this from reading as one
                more muted aside. */}
            <p className="flex w-full items-center gap-2 rounded-ui border border-transparent bg-muted px-3 py-2 text-xs text-muted-foreground">
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
            // The box's one action, and at size="sm" it was 32px: the shortest
            // control in a box whose plea and shelter name are both 14px
            // medium, so the thing to do about the wait was the smallest thing
            // in it. Default is 36px and sits with them.
            size="default"
            className={cn(
              // pointer-coarse:h-11, because 36px is still short for a thumb
              // and on the animal's own page, which has no sticky bar to
              // mirror this, it is the button a thumb actually goes for. On
              // the pointer and not on the width: at max-sm a 768px tablet,
              // where this is the only copy of the button, measured 36px.
              "w-full sm:w-auto",
              // The label may take a second line rather than run out of the
              // box. Buttons are nowrap, which at a 200% root font pushed the
              // external-link mark 2px past a 390 viewport and gave the whole
              // page a sideways scroll. The height follows the text instead
              // of the label overflowing a fixed box, and at any font size
              // the label fits on one line nothing about it moves.
              "h-auto min-h-9 py-1.5 whitespace-normal pointer-coarse:min-h-11",
              // The shell and not the width, because the bar this mirrors
              // follows the shell: a phone held sideways is the phone shell
              // too, and on width alone a landscape phone printed the same
              // button twice, once in the box and once in the bar.
              ctaMirrored && "phone-shell:hidden",
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

      {/* One footnote, not two. The attribution stays under the box, where it
          does not read as the shelter's name printed twice 40px apart, and it
          is now the first half of the freshness line rather than a paragraph
          of its own above it: both say who the listing came from and when it
          was last seen. It goes through SourceFreshness so nothing else has to
          know how the two halves are joined. */}
      <SourceFreshness
        attribution={animal.attribution}
        checkedAt={animal.source.fetchedAt}
        reference={reference}
      />
    </div>
  );
}
