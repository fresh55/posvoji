"use client";

import Image from "next/image";
import {
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
} from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Animal } from "@posvoji/schema";
import { useI18n } from "@/components/i18n-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  adjacentImageUrls,
  permittedImageUrls,
} from "@/lib/animal-images";
import { translate } from "@/lib/i18n";
import { animalMeta } from "@/lib/labels";

const GALLERY_BUTTON_CLASS =
  "absolute inset-y-0 z-10 my-auto rounded-full bg-background/80 shadow-xs backdrop-blur-sm transition-opacity hover:bg-background active:translate-y-0! sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100";

type SwipeStart = { x: number; y: number };

function AnimalGallery({ animal }: { animal: Animal }) {
  const images = permittedImageUrls(animal.images);
  const [imageIndex, setImageIndex] = useState(0);
  const swipeStart = useRef<SwipeStart | null>(null);
  const suppressImageLink = useRef(false);
  const preloadedImages = useRef(new Set<string>());
  const { locale, messages } = useI18n();
  const image = images[imageIndex];
  const hasGallery = images.length > 1;

  function preloadAdjacent(index: number) {
    for (const source of adjacentImageUrls(images, index)) {
      if (preloadedImages.current.has(source)) continue;
      preloadedImages.current.add(source);
      const preload = new window.Image();
      preload.src = source;
    }
  }

  function changeImage(direction: -1 | 1) {
    if (!hasGallery) return;
    const nextIndex = (imageIndex + direction + images.length) % images.length;
    preloadAdjacent(nextIndex);
    setImageIndex(nextIndex);
  }

  function startSwipe(event: PointerEvent<HTMLAnchorElement>) {
    if (!hasGallery || event.pointerType === "mouse") return;
    swipeStart.current = { x: event.clientX, y: event.clientY };
    suppressImageLink.current = false;
    preloadAdjacent(imageIndex);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function finishSwipe(event: PointerEvent<HTMLAnchorElement>) {
    if (!swipeStart.current) return;

    const distanceX = event.clientX - swipeStart.current.x;
    const distanceY = event.clientY - swipeStart.current.y;
    swipeStart.current = null;
    if (Math.abs(distanceX) < 48 || Math.abs(distanceX) <= Math.abs(distanceY)) {
      return;
    }

    suppressImageLink.current = true;
    changeImage(distanceX < 0 ? 1 : -1);
  }

  function openImageLink(event: MouseEvent<HTMLAnchorElement>) {
    if (!suppressImageLink.current) return;
    event.preventDefault();
    suppressImageLink.current = false;
  }

  return (
    <div className="relative aspect-[4/3] overflow-hidden rounded-t-lg bg-muted">
      <a
        href={animal.source.sourceUrl}
        target="_blank"
        rel="noreferrer"
        aria-label={translate(locale, "openAnimal", {
          name: animal.name ?? messages.unnamed,
        })}
        onPointerDown={startSwipe}
        onPointerEnter={() => preloadAdjacent(imageIndex)}
        onFocus={() => preloadAdjacent(imageIndex)}
        onPointerUp={finishSwipe}
        onPointerCancel={() => {
          swipeStart.current = null;
        }}
        onClick={openImageLink}
        className="absolute inset-0 touch-pan-y"
      >
        {image ? (
          <Image
            src={image}
            alt={animal.name ?? messages.unnamed}
            fill
            sizes="(max-width: 639px) 50vw, (max-width: 1023px) 33vw, 25vw"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center px-4 text-center text-xs text-muted-foreground">
            {messages.photoAtShelter}
          </div>
        )}
      </a>

      {hasGallery && (
        <>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            onClick={() => changeImage(-1)}
            aria-label={messages.previousPhoto}
            className={`${GALLERY_BUTTON_CLASS} left-1.5`}
          >
            <ChevronLeft className="size-4" aria-hidden />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            onClick={() => changeImage(1)}
            aria-label={messages.nextPhoto}
            className={`${GALLERY_BUTTON_CLASS} right-1.5`}
          >
            <ChevronRight className="size-4" aria-hidden />
          </Button>
          <Badge
            variant="secondary"
            aria-hidden
            className="absolute bottom-1.5 right-1.5 h-5 bg-background/70 px-1.5 text-[10px] tabular-nums shadow-xs backdrop-blur-sm"
          >
            {imageIndex + 1} / {images.length}
          </Badge>
          <span className="sr-only" aria-live="polite" aria-atomic="true">
            {translate(locale, "photoCount", {
              current: imageIndex + 1,
              total: images.length,
            })}
          </span>
        </>
      )}
    </div>
  );
}

export function AnimalCard({ animal }: { animal: Animal }) {
  const { locale, messages } = useI18n();

  return (
    <article className="group overflow-hidden rounded-lg border transition-colors hover:border-foreground/25 focus-within:border-foreground/25">
      <AnimalGallery animal={animal} />
      <a
        href={animal.source.sourceUrl}
        target="_blank"
        rel="noreferrer"
        className="block space-y-1 p-3 focus-visible:outline-2 focus-visible:outline-offset-[-2px]"
      >
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="truncate font-medium">{animal.name ?? messages.unnamed}</h3>
          {animal.status === "reserved" && (
            <span className="shrink-0 text-xs text-muted-foreground">
              {messages.reserved}
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground">{animalMeta(animal, locale)}</p>
        <p className="truncate text-xs text-muted-foreground/80">{animal.shelter.name}</p>
      </a>
    </article>
  );
}

export function AnimalCardSkeleton() {
  return (
    <div className="rounded-lg border">
      <Skeleton className="aspect-[4/3] rounded-b-none" />
      <div className="space-y-2 p-3">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-3 w-24" />
      </div>
    </div>
  );
}
