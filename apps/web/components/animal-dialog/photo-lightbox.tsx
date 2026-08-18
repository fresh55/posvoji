"use client";

import Image from "next/image";
import { useRef } from "react";
import { ChevronLeft, ChevronRight, XIcon } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
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

// A nested dialog rather than a bare overlay: Radix stacks the layers, so
// Escape closes this one and leaves the animal open underneath.
export function PhotoLightbox({
  open,
  onOpenChange,
  images,
  index,
  onIndexChange,
  title,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  images: string[];
  index: number;
  onIndexChange: (index: number) => void;
  title: string;
}) {
  const { messages, t } = useI18n();
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

          <div className="relative h-full w-full">
            <Image
              src={image}
              alt=""
              fill
              sizes="100vw"
              className="object-contain"
            />
          </div>

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
