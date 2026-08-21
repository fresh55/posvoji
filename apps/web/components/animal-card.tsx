"use client";

import { useRef, type MouseEvent } from "react";
import { Hourglass, MapPin } from "lucide-react";
import type { Animal } from "@posvoji/schema";
import type { DialogOrigin } from "@/components/animal-dialog/animal-dialog";
import { useI18n } from "@/components/i18n-provider";
import { PhotoGallery } from "@/components/photo-gallery";
import { Skeleton } from "@/components/ui/skeleton";
import { animalPath } from "@/lib/animal-path";
import { translate } from "@/lib/i18n";
import { animalMeta, longStayLabel, statusLabel } from "@/lib/labels";

// Adopted and hold are over, and the card agrees with them the way the
// dialog's stage light does: about half the colour goes and the photo settles
// back towards the page it sits on. Available and reserved are still live and
// are left alone.
const QUIET_PHOTO = "saturate-[60%] opacity-80";

export function AnimalCard({
  animal,
  reference,
  onOpen,
  onShelterClick,
}: {
  animal: Animal;
  /** The dataset's build time, so prerendered ages survive hydration. */
  reference: Date;
  onOpen: (id: string, origin?: DialogOrigin) => void;
  /** Turns the shelter's name into a control that asks the map to spotlight
   *  it. Opt-in, because only a page that also mounts the location picker has
   *  anything to answer with: a shelter's own page renders these cards with no
   *  picker in the tree, and there the name stays inert text. */
  onShelterClick?: (shelterId: string) => void;
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
  // The shelter's name is the visible label and the accessible name says more
  // than it, so the name has to be inside the spoken sentence: WCAG 2.5.3 asks
  // that what is read starts from what is written.
  const shelterLabel = translate(locale, "showShelterOnMap", {
    shelter: animal.shelter.name,
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
          <span className="absolute left-2 top-2 rounded-full border border-amber-500/40 bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-700 backdrop-blur-sm dark:text-amber-300 sm:hidden">
            {statusLabel("reserved", locale)}
          </span>
        )}
      </div>
      <a
        href={href}
        onClick={openDialog}
        // px-3 pt-3 and not p-3: the shelter line below is a sibling now, and
        // the padding that used to close the anchor closes the card down
        // there instead. The rhythm is unchanged, just split across the two:
        // pt-1 on the sibling is the space-y-1 gap this anchor no longer
        // spans, and its pb-3 is this one's missing bottom.
        className="block space-y-1 px-3 pt-3 focus-visible:outline-2 focus-visible:outline-offset-[-2px]"
      >
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="truncate font-medium">{animal.name ?? messages.unnamed}</h3>
          {animal.status === "reserved" && (
            // Same amber-family recipe as the dialog's reserved badge
            // (animal-dialog.tsx STATUS_CLASS), scaled down to the grid card.
            // Hidden below sm, where the photo overlay above carries it instead.
            <span className="hidden shrink-0 rounded-full border border-amber-500/40 bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300 sm:inline">
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

      {/* Outside the anchor, because a control inside a link is a control
          nothing can reach: a keyboard would have to walk through the card's
          own link to get to it and a screen reader would announce one thing
          sitting in another. The line keeps the anchor's place in the card, so
          the split is only in the DOM.

          The affordance is a pin at the same muted weight the line already
          had, and the colour only moves on hover. The site says "clickable"
          this quietly everywhere else (see the picker's own rail and clear
          buttons), and a shelter's name on a card is a footnote, not the
          card's offer. The outline is inset like the anchor's above it,
          because the article clips its overflow and an outward one would be
          cut off at the card's bottom edge. */}
      {onShelterClick ? (
        <button
          type="button"
          onClick={() => onShelterClick(animal.shelter.id)}
          aria-label={shelterLabel}
          // cursor-pointer because a bare <button> keeps the arrow cursor, and
          // nothing else here says the line answers a click.
          className="flex w-full cursor-pointer items-center gap-1 px-3 pb-3 pt-1 text-left text-xs text-muted-foreground/80 transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-[-2px]"
        >
          <MapPin className="size-3 shrink-0" strokeWidth={1.75} aria-hidden />
          <span className="min-w-0 truncate">{animal.shelter.name}</span>
        </button>
      ) : (
        <p className="truncate px-3 pb-3 pt-1 text-xs text-muted-foreground/80">
          {animal.shelter.name}
        </p>
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
