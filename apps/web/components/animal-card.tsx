"use client";

import { useRef, type MouseEvent } from "react";
import { ChevronRight, Hourglass, House } from "lucide-react";
import type { Animal } from "@posvoji/schema";
import type { DialogOrigin } from "@/components/animal-dialog/animal-dialog";
import { useI18n } from "@/components/i18n-provider";
import { PhotoGallery } from "@/components/photo-gallery";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { animalPath } from "@/lib/animal-path";
import { translate } from "@/lib/i18n";
import { animalMeta, longStayLabel, statusLabel } from "@/lib/labels";
import { shelterPath } from "@/lib/shelter-path";

// Adopted and hold are over, and the card agrees with them the way the
// dialog's stage light does: about half the colour goes and the photo settles
// back towards the page it sits on. Available and reserved are still live and
// are left alone.
const QUIET_PHOTO = "saturate-[60%] opacity-80";

export function AnimalCard({
  animal,
  reference,
  onOpen,
  showShelter = false,
}: {
  animal: Animal;
  /** The dataset's build time, so prerendered ages survive hydration. */
  reference: Date;
  onOpen: (id: string, origin?: DialogOrigin) => void;
  /** Draws the shelter line, which links to that shelter's own page. Opt-in,
   *  because a shelter's own page renders these cards and there the line would
   *  be the page linking to itself under every animal on it. */
  showShelter?: boolean;
}) {
  const { locale, messages, t } = useI18n();
  const cardRef = useRef<HTMLElement>(null);
  const wait = longStayLabel(animal, locale, reference);
  // The animal's own page, which is also what the dialog writes to the
  // address bar when this card is clicked. Filters are deliberately left out:
  // the href is written at build time, where the visitor's filters do not
  // exist, and computing it on the client would not survive hydration. A
  // modified click therefore deep links to the animal without them, while a
  // plain click keeps them and opens the dialog in place.
  const settled = animal.status === "adopted" || animal.status === "hold";
  const href = animalPath(animal, locale);
  const label = translate(locale, "openDetails", {
    name: animal.name ?? messages.unnamed,
  });

  // The href is a real deep link, so a middle click or a held modifier gets
  // the tab it asked for. A plain click stays on the page and opens the
  // dialog, and hands over where it came from for the zoom to grow out of.
  function openDialog(event: MouseEvent<HTMLAnchorElement>) {
    if (
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      event.button !== 0
    ) {
      return;
    }
    event.preventDefault();
    const rect = cardRef.current?.getBoundingClientRect();
    // The gallery is the card's first child, and its box is the photo as the
    // visitor sees it, which is what the dialog carries into the fan.
    const photo = cardRef.current?.firstElementChild?.getBoundingClientRect();
    onOpen(
      animal.id,
      rect
        ? {
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2,
            photo: photo?.width
              ? {
                  left: photo.left,
                  top: photo.top,
                  width: photo.width,
                  height: photo.height,
                }
              : undefined,
          }
        : undefined,
    );
  }

  return (
    <article
      ref={cardRef}
      className="group overflow-hidden rounded-ui border transition-colors hover:border-foreground/25 focus-within:border-foreground/25"
    >
      <div className="relative">
        <PhotoGallery
          animal={animal}
          sizes="(max-width: 639px) 50vw, (max-width: 1023px) 33vw, 25vw"
          tone={settled ? QUIET_PHOTO : undefined}
          href={href}
          linkLabel={label}
          onNavigate={openDialog}
        />
        {animal.status === "reserved" && (
          // Below sm the 2-col phone grid leaves the name's row too narrow to
          // also hold this badge and the wait label, and the name is what
          // matters most there, so the badge moves onto the photo instead of
          // competing for the row. At sm and up there is room, and it returns
          // to sitting beside the name (its usual, higher-contrast spot).
          <span className="absolute left-2 top-2 rounded-full border border-amber-500/40 bg-amber-500/15 px-2 py-0.5 text-2xs font-medium text-amber-700 backdrop-blur-sm dark:text-amber-300 sm:hidden">
            {statusLabel("reserved", locale)}
          </span>
        )}
      </div>
      <a
        href={href}
        onClick={openDialog}
        // px-3 pt-3 and not p-3: the shelter line below is a sibling now, and
        // the padding that used to close the anchor closes the card down
        // there instead. The sibling's pt-0.5 and pb-2 are smaller than the
        // pt-1 and pb-3 this anchor gave up, because the button it now holds
        // is 24px tall where the old text line was 16, and the card ends up
        // within a couple of pixels of the height it always had.
        className="block space-y-1 px-3 pt-3 focus-visible:outline-2 focus-visible:outline-offset-[-2px]"
      >
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="truncate font-medium">{animal.name ?? messages.unnamed}</h3>
          {animal.status === "reserved" && (
            // Same amber-family recipe as the dialog's reserved badge
            // (animal-dialog.tsx STATUS_CLASS), scaled down to the grid card.
            // Hidden below sm, where the photo overlay above carries it instead.
            <span className="hidden shrink-0 rounded-full border border-amber-500/40 bg-amber-500/15 px-2 py-0.5 text-2xs font-medium text-amber-700 dark:text-amber-300 sm:inline">
              {statusLabel("reserved", locale)}
            </span>
          )}
          {wait && (
            <span className="hidden shrink-0 items-center gap-1 whitespace-nowrap text-xs text-muted-foreground sm:inline-flex">
              <Hourglass
                className="size-3.5 text-amber-600 dark:text-amber-400"
                strokeWidth={1.75}
                aria-hidden
              />
              {t("longStayMark", { duration: wait })}
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground tabular-nums">
          {animalMeta(animal, locale, reference)}
        </p>
        {wait && (
          // Below sm the wait label gets its own line under the meta text,
          // instead of sharing the name's row where it forced the truncating
          // name down to a character or two.
          <p className="flex items-center gap-1 text-xs text-muted-foreground sm:hidden">
            <Hourglass
              className="size-3.5 shrink-0 text-amber-600 dark:text-amber-400"
              strokeWidth={1.75}
              aria-hidden
            />
            {t("longStayMark", { duration: wait })}
          </p>
        )}
      </a>

      {/* Outside the anchor, because a link inside a link is not markup a
          browser or a screen reader can make sense of. The line keeps the
          anchor's place in the card, so the split is only in the DOM.

          It goes to the shelter's own page, which is the one destination that
          answers both questions somebody presses a shelter's name to ask: who
          they are, and what else they have. Being a real href, it also costs
          no hydration, opens in a tab on a middle click, and links 500 animal
          cards into 17 shelter pages for a crawler that would otherwise only
          reach them from the index.

          Button asChild over an <a> is the house pattern (shelter-block.tsx
          wraps its listing link the same way), and at size xs the design system
          already has this exact control: h-6, text-xs, size-3 icons, the focus
          ring and the press shift every other control here has. The wrapper's
          px-1 plus the button's own px-2 put the text back on the same 12px
          rail as the heading above, and leave the hover fill an inset pill
          rather than a band across the card.

          House and not MapPin. The pin means "place" everywhere else on the
          site (shelter-card.tsx draws it beside a city), and this line is not
          where the animal is, it is who is keeping it.

          The chevron is the affordance and it is drawn at rest. Hover was
          carrying that alone, which says nothing at all on a phone. */}
      {showShelter && (
        <div className="px-1 pb-2 pt-0.5">
          <Button
            asChild
            variant="ghost"
            size="xs"
            // font-normal because the button's own font-medium would put this
            // footnote at the weight of the animal's name above it.
            className="w-full justify-start font-normal text-muted-foreground hover:text-foreground"
          >
            <a href={shelterPath(animal.shelter.id, locale)}>
              <House aria-hidden />
              {/* The link's own text is its accessible name, the way the
                  shelter card's is. An aria-label here could only repeat the
                  name with words around it, and WCAG 2.5.3 asks that what is
                  spoken start from what is written. */}
              <span className="min-w-0 truncate">{animal.shelter.name}</span>
              {/* data-icon is what tells the button to tighten its right
                  padding for a trailing icon (see buttonVariants). */}
              <ChevronRight
                data-icon="inline-end"
                aria-hidden
                className="ml-auto opacity-60"
              />
            </a>
          </Button>
        </div>
      )}
    </article>
  );
}

export function AnimalCardSkeleton() {
  return (
    <div className="rounded-ui border">
      <Skeleton className="aspect-[4/3] rounded-b-none" />
      <div className="space-y-2 p-3">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-3 w-24" />
      </div>
    </div>
  );
}
