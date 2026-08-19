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
import {
  adjacentImageUrls,
  permittedImageUrls,
} from "@/lib/animal-images";
import { translate } from "@/lib/i18n";
import { cn } from "@/lib/utils";

// Shared with the dialog's photo spread, so both sets of chevrons behave and
// look the same.
export const GALLERY_BUTTON_CLASS =
  "absolute inset-y-0 z-10 my-auto rounded-full bg-background/80 shadow-xs backdrop-blur-sm transition-opacity hover:bg-background active:translate-y-0! sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100";

const DEFAULT_WRAPPER_CLASS =
  "relative aspect-[4/3] overflow-hidden rounded-ui-top bg-muted";

type SwipeStart = { x: number; y: number };

type PhotoGalleryProps = {
  animal: Animal;
  sizes: string;
  className?: string;
  /**
   * Laid over whatever the surface already is, for callers that want the
   * photo and its counter to read quieter than the rest of the page.
   */
  tone?: string;
  /** Set to make the photo a link; leave out for a plain surface. */
  href?: string;
  linkLabel?: string;
  // Runs only for a click the swipe handler did not already swallow. The
  // event comes along because the caller decides whether to keep the
  // navigation (a modified click) or take it over.
  onNavigate?: (event: MouseEvent<HTMLAnchorElement>) => void;
  /** Set to drive the gallery from outside; leave out to keep its own index. */
  index?: number;
  onIndexChange?: (index: number) => void;
};

export function PhotoGallery({
  animal,
  sizes,
  className,
  tone,
  href,
  linkLabel,
  onNavigate,
  index,
  onIndexChange,
}: PhotoGalleryProps) {
  const images = permittedImageUrls(animal.images);
  const [ownIndex, setOwnIndex] = useState(0);
  const swipeStart = useRef<SwipeStart | null>(null);
  const suppressImageLink = useRef(false);
  const preloadedImages = useRef(new Set<string>());
  const { locale, messages } = useI18n();
  // The card owns nothing and keeps its own index; the dialog shares one index
  // between the swipeable photo and the thumbnails under it.
  const imageIndex = index ?? ownIndex;
  const image = images[imageIndex];
  const hasGallery = images.length > 1;

  function setImageIndex(next: number) {
    if (index === undefined) setOwnIndex(next);
    onIndexChange?.(next);
  }

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

  function startSwipe(event: PointerEvent<HTMLElement>) {
    if (!hasGallery || event.pointerType === "mouse") return;
    swipeStart.current = { x: event.clientX, y: event.clientY };
    suppressImageLink.current = false;
    preloadAdjacent(imageIndex);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function finishSwipe(event: PointerEvent<HTMLElement>) {
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

  function handleSwipeCancel() {
    swipeStart.current = null;
  }

  function handlePointerEnter() {
    preloadAdjacent(imageIndex);
  }

  function handleFocus() {
    preloadAdjacent(imageIndex);
  }

  function openImageLink(event: MouseEvent<HTMLAnchorElement>) {
    if (suppressImageLink.current) {
      event.preventDefault();
      suppressImageLink.current = false;
      return;
    }
    onNavigate?.(event);
  }

  // The swipe contract is the same whether the photo is a link or not, so
  // both surfaces are handed the same set of handlers.
  const surface = {
    onPointerDown: startSwipe,
    onPointerEnter: handlePointerEnter,
    onFocus: handleFocus,
    onPointerUp: finishSwipe,
    onPointerCancel: handleSwipeCancel,
    className: "absolute inset-0 touch-pan-y",
  };

  const imageContent = image ? (
    <Image
      src={image}
      alt={animal.name ?? messages.unnamed}
      fill
      sizes={sizes}
      className="object-cover"
    />
  ) : (
    <div className="flex h-full items-center justify-center px-4 text-center text-xs text-muted-foreground">
      {messages.photoAtShelter}
    </div>
  );

  return (
    <div className={cn(className ?? DEFAULT_WRAPPER_CLASS, tone)}>
      {href ? (
        <a
          href={href}
          aria-label={linkLabel}
          onClick={openImageLink}
          {...surface}
        >
          {imageContent}
        </a>
      ) : (
        <div {...surface}>{imageContent}</div>
      )}

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
