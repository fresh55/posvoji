"use client";

import Image from "next/image";
import { useRef } from "react";
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

  function step(direction: -1 | 1) {
    onIndexChange((index + direction + images.length) % images.length);
  }

  if (!image) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
            <Image
              src={image}
              alt=""
              fill
              sizes="100vw"
              className="object-contain"
            />
          </m.div>

          <DialogPrimitive.Close asChild>
            <Button
              variant="outline"
              size="icon-sm"
              className={`${LIGHTBOX_BUTTON_CLASS} top-4 right-4 size-11 sm:size-9`}
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
                className={`${LIGHTBOX_BUTTON_CLASS} inset-y-0 left-4 my-auto size-11 sm:size-9`}
              >
                <ChevronLeft className="size-4" aria-hidden />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                onClick={() => step(1)}
                aria-label={messages.nextPhoto}
                className={`${LIGHTBOX_BUTTON_CLASS} inset-y-0 right-4 my-auto size-11 sm:size-9`}
              >
                <ChevronRight className="size-4" aria-hidden />
              </Button>
              <Badge
                aria-hidden
                variant="secondary"
                className="absolute bottom-4 left-1/2 h-6 -translate-x-1/2 bg-background/80 px-2 text-xs tabular-nums shadow-xs backdrop-blur-sm"
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
