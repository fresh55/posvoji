"use client";

import { useRef, type MouseEvent } from "react";
import type { Animal } from "@posvoji/schema";
import type { DialogOrigin } from "@/components/animal-dialog/animal-dialog";
import { useI18n } from "@/components/i18n-provider";
import { PhotoGallery } from "@/components/photo-gallery";
import { Skeleton } from "@/components/ui/skeleton";
import { translate } from "@/lib/i18n";
import { animalMeta, statusLabel } from "@/lib/labels";

// Adopted and hold are over, and the card agrees with them the way the
// dialog's stage light does: about half the colour goes and the photo settles
// back towards the page it sits on. Available and reserved are still live and
// are left alone.
const QUIET_PHOTO = "saturate-[60%] opacity-80";

export function AnimalCard({
  animal,
  reference,
  onOpen,
}: {
  animal: Animal;
  /** The dataset's build time, so prerendered ages survive hydration. */
  reference: Date;
  onOpen: (id: string, origin?: DialogOrigin) => void;
}) {
  const { locale, messages } = useI18n();
  const cardRef = useRef<HTMLElement>(null);
  // Filters are deliberately left out: this href is written at build time,
  // where the visitor's filters do not exist, and computing it on the client
  // would not survive hydration. A modified click therefore deep links to the
  // animal without them, while a plain click keeps them through the router.
  const settled = animal.status === "adopted" || animal.status === "hold";
  const href = `?zival=${encodeURIComponent(animal.id)}`;
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
      <PhotoGallery
        animal={animal}
        sizes="(max-width: 639px) 50vw, (max-width: 1023px) 33vw, 25vw"
        tone={settled ? QUIET_PHOTO : undefined}
        href={href}
        linkLabel={label}
        onNavigate={openDialog}
      />
      <a
        href={href}
        onClick={openDialog}
        className="block space-y-1 p-3 focus-visible:outline-2 focus-visible:outline-offset-[-2px]"
      >
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="truncate font-medium">{animal.name ?? messages.unnamed}</h3>
          {animal.status === "reserved" && (
            <span className="shrink-0 text-xs text-muted-foreground">
              {statusLabel("reserved", locale)}
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          {animalMeta(animal, locale, reference)}
        </p>
        <p className="truncate text-xs text-muted-foreground/80">{animal.shelter.name}</p>
      </a>
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
