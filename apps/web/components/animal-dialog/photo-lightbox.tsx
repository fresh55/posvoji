"use client";

import Image from "next/image";
import { useRef, useState, type PointerEvent } from "react";
import { ChevronLeft, ChevronRight, XIcon } from "lucide-react";
import { m, useReducedMotion } from "motion/react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { LightboxWash } from "@/components/animal-dialog/photo-wash";
import { useI18n } from "@/components/i18n-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const LIGHTBOX_BUTTON_CLASS =
  "absolute z-10 rounded-full bg-background/80 shadow-xs backdrop-blur-sm hover:bg-background active:translate-y-0!";

// Slow enough to read as one photo travelling, quick enough that nobody waits
// for it. Barely underdamped, so it lands rather than wobbles.
const MORPH_SPRING = {
  type: "spring",
  stiffness: 300,
  damping: 32,
  mass: 0.9,
} as const;

// The frame fills the content box inside its own padding, and these mirror the
// padding set on that box. Working the landing rect out rather than measuring
// it means the first frame the browser paints is already the small one sitting
// on the fan, so the full-size photo is never shown and then yanked away.
const FRAME_PHONE_PAD = 16;
const FRAME_WIDE_PAD = 40;
const WIDE_FROM = 640;

// A sideways drag past this many pixels, or one quick enough to look like a
// flick even short of it, changes the photo. The same shape as the card
// gallery's own swipe, since a visitor's thumb should not have to relearn it
// for the full-screen view.
const SWIPE_DISTANCE_PX = 48;
const SWIPE_VELOCITY_PX_MS = 0.5;

// Two taps land inside this window and this close together to read as one
// double tap rather than two separate ones.
const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_SLOP_PX = 24;
const ZOOM_SCALE = 2;

/**
 * Where the frame has to start for the photo to look like it grew out of the
 * one in the fan. The scale is uniform: the two boxes are cropped differently,
 * and stretching one into the other reads as a squash rather than a zoom.
 */
function framePose(origin: DOMRect | undefined) {
  if (!origin?.width || typeof window === "undefined") return undefined;
  const pad = window.innerWidth >= WIDE_FROM ? FRAME_WIDE_PAD : FRAME_PHONE_PAD;
  const width = window.innerWidth - pad * 2;
  const height = window.innerHeight - pad * 2;
  if (width <= 0 || height <= 0) return undefined;
  return {
    x: origin.left + origin.width / 2 - (pad + width / 2),
    y: origin.top + origin.height / 2 - (pad + height / 2),
    scale: origin.width / width,
  };
}

// A nested dialog rather than a bare overlay: Radix stacks the layers, so
// Escape closes this one and leaves the animal open underneath.
export function PhotoLightbox({
  open,
  onOpenChange,
  images,
  index,
  onIndexChange,
  title,
  originRect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  images: string[];
  index: number;
  onIndexChange: (index: number) => void;
  title: string;
  /** Where the photo was sitting in the fan when it was clicked. */
  originRect?: DOMRect;
}) {
  const { messages, t } = useI18n();
  const shouldReduceMotion = useReducedMotion();
  // The photo that was clicked is where focus belongs on the way out, and a
  // dialog opened from the URL has no trigger for Radix to hand it back to.
  const returnFocus = useRef<HTMLElement | null>(null);
  const image = images[index];
  const many = images.length > 1;

  // Where the double tap that zoomed in landed, as a percentage of the frame,
  // so the zoom grows out from under the finger rather than the middle of the
  // photo. Null means the photo is shown at its normal size. The photo it was
  // taken on is stored with it: a zoom belongs to one picture, and reading it
  // back only when the index still matches is what makes a step to the next
  // photo start unzoomed. Doing that by hand in an effect would set state on
  // every index change just to reach the same place a render later.
  const [zoom, setZoom] = useState<{
    index: number;
    x: number;
    y: number;
  } | null>(null);
  const zoomOrigin = zoom?.index === index ? zoom : null;
  const touchStart = useRef<{ x: number; y: number; time: number } | null>(
    null,
  );
  const lastTap = useRef<{ x: number; y: number; time: number } | null>(null);

  // The lightbox stays mounted across visits, so the zoom has to be dropped on
  // the way out or the next visit to the same photo would open into it. Every
  // close goes through here: Escape, the close button and the overlay all
  // reach the caller's setter through Radix's onOpenChange.
  function handleOpenChange(next: boolean) {
    if (!next) setZoom(null);
    onOpenChange(next);
  }

  function step(direction: -1 | 1) {
    onIndexChange((index + direction + images.length) % images.length);
  }

  function startTouch(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType === "mouse") return;
    touchStart.current = { x: event.clientX, y: event.clientY, time: event.timeStamp };
  }

  function endTouch(event: PointerEvent<HTMLDivElement>) {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start) return;

    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    const distance = Math.hypot(dx, dy);

    // A tap that barely moved is a candidate for the double tap; two of them
    // close together in time and place toggle the zoom.
    if (distance < DOUBLE_TAP_SLOP_PX) {
      const previous = lastTap.current;
      const rect = event.currentTarget.getBoundingClientRect();
      const originX = ((event.clientX - rect.left) / rect.width) * 100;
      const originY = ((event.clientY - rect.top) / rect.height) * 100;
      if (
        previous &&
        event.timeStamp - previous.time < DOUBLE_TAP_MS &&
        Math.hypot(event.clientX - previous.x, event.clientY - previous.y) <
          DOUBLE_TAP_SLOP_PX
      ) {
        lastTap.current = null;
        setZoom((current) =>
          current?.index === index ? null : { index, x: originX, y: originY },
        );
        return;
      }
      lastTap.current = { x: event.clientX, y: event.clientY, time: event.timeStamp };
      return;
    }

    // A swipe only steps between photos at the normal size; zoomed in, a
    // sideways drag is for panning, not for changing the picture.
    if (zoomOrigin || !many) return;
    if (Math.abs(dx) <= Math.abs(dy)) return;

    const elapsed = Math.max(1, event.timeStamp - start.time);
    const velocity = Math.abs(dx) / elapsed;
    if (Math.abs(dx) < SWIPE_DISTANCE_PX && velocity < SWIPE_VELOCITY_PX_MS) {
      return;
    }
    step(dx < 0 ? 1 : -1);
  }

  function cancelTouch() {
    touchStart.current = null;
  }

  if (!image) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogPortal>
        <DialogOverlay className="z-60 bg-black/80 supports-backdrop-filter:backdrop-blur-none" />
        <DialogPrimitive.Content
          data-slot="photo-lightbox"
          className="fixed inset-0 z-60 flex items-center justify-center p-4 outline-none sm:p-10"
          onOpenAutoFocus={() => {
            returnFocus.current = document.activeElement as HTMLElement | null;
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            returnFocus.current?.focus();
            returnFocus.current = null;
          }}
          onKeyDown={(event) => {
            if (!many) return;
            if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
            event.preventDefault();
            step(event.key === "ArrowLeft" ? -1 : 1);
          }}
          aria-describedby={undefined}
        >
          <DialogTitle className="sr-only">{title}</DialogTitle>

          {/* The same echo the stage has, on the scrim rather than the page.
              It stays under the photo and under the controls, so the only
              thing it changes is the empty ground the photo is matted on. */}
          <LightboxWash source={image} />

          {/* Only the way in travels. On the way out Radix takes the content
              away with its own fade, which is what it already did, and is the
              price of leaving the focus trap and Escape alone. */}
          <m.div
            data-slot="photo-lightbox-frame"
            className="relative h-full w-full"
            initial={shouldReduceMotion ? false : (framePose(originRect) ?? false)}
            animate={{ x: 0, y: 0, scale: 1 }}
            transition={shouldReduceMotion ? { duration: 0 } : MORPH_SPRING}
          >
            {/* touch-pan-y keeps a vertical drag free for the page (and for
                Radix to dismiss on, where that gesture exists) while a
                sideways one is read as a photo change. */}
            <div
              className="relative h-full w-full touch-pan-y overflow-hidden"
              onPointerDown={startTouch}
              onPointerUp={endTouch}
              onPointerCancel={cancelTouch}
            >
              <div
                className={cn(
                  "relative h-full w-full",
                  !shouldReduceMotion && "transition-transform duration-200 ease-out",
                )}
                style={{
                  transform: zoomOrigin ? `scale(${ZOOM_SCALE})` : undefined,
                  transformOrigin: zoomOrigin
                    ? `${zoomOrigin.x}% ${zoomOrigin.y}%`
                    : undefined,
                }}
              >
                <Image
                  src={image}
                  alt=""
                  fill
                  sizes="100vw"
                  className="object-contain"
                />
              </div>
            </div>
          </m.div>

          <DialogPrimitive.Close asChild>
            <Button
              variant="outline"
              size="icon-sm"
              className={`${LIGHTBOX_BUTTON_CLASS} top-[max(1rem,env(safe-area-inset-top))] right-[max(1rem,env(safe-area-inset-right))] size-11 sm:top-4 sm:right-4 sm:size-9`}
            >
              <XIcon aria-hidden />
              <span className="sr-only">{messages.close}</span>
            </Button>
          </DialogPrimitive.Close>

          {many && (
            <>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                onClick={() => step(-1)}
                aria-label={messages.previousPhoto}
                className={`${LIGHTBOX_BUTTON_CLASS} inset-y-0 left-[max(1rem,env(safe-area-inset-left))] my-auto size-11 sm:left-4 sm:size-9`}
              >
                <ChevronLeft className="size-4" aria-hidden />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                onClick={() => step(1)}
                aria-label={messages.nextPhoto}
                className={`${LIGHTBOX_BUTTON_CLASS} inset-y-0 right-[max(1rem,env(safe-area-inset-right))] my-auto size-11 sm:right-4 sm:size-9`}
              >
                <ChevronRight className="size-4" aria-hidden />
              </Button>
              <Badge
                aria-hidden
                variant="secondary"
                className="absolute bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 h-6 -translate-x-1/2 bg-background/80 px-2 text-xs tabular-nums shadow-xs backdrop-blur-sm sm:bottom-4"
              >
                {index + 1} / {images.length}
              </Badge>
              <span className="sr-only" aria-live="polite" aria-atomic="true">
                {t("photoCount", { current: index + 1, total: images.length })}
              </span>
            </>
          )}
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
