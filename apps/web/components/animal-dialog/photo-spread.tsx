"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { AnimatePresence, m, useReducedMotion } from "motion/react";
import type { Animal } from "@posvoji/schema";
import { PhotoLightbox } from "@/components/animal-dialog/photo-lightbox";
import { useI18n } from "@/components/i18n-provider";
import {
  GALLERY_BUTTON_CLASS,
  PhotoGallery,
} from "@/components/photo-gallery";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { permittedImageUrls } from "@/lib/animal-images";
import { cn } from "@/lib/utils";

// Five photos is where a fan still reads as a fan. Past that the window walks
// the rest into view as the visitor steps through them.
const FAN_LIMIT = 5;

const FAN_SPRING = {
  type: "spring",
  stiffness: 420,
  damping: 26,
  mass: 0.5,
} as const;

const ENTRANCE_STAGGER = 0.04;

// A fixed nudge per photo keeps the fan from looking machine cut. It is picked
// by position, never at random, so the same animal always fans out the same.
const TILT_NUDGE = [0, -1.2, 0.8, -0.6, 1.4];

// Every photo box is the same size and is pulled into place by transforms, so
// the fan scales with the dialog instead of with a pixel guess. x is a share
// of the photo's own width, where -50% is dead center. The drop is small on
// purpose: the fan is allowed to hang into the card's top padding, never as
// far as the title row.
function fanPose(offset: number) {
  if (offset === 0) return { x: "-50%", y: 0, rotate: 0, scale: 1 };
  const side = Math.sign(offset);
  const depth = Math.min(Math.abs(offset), 2);
  const { shift, drop, tilt, scale } =
    depth === 1
      ? { shift: 58, drop: 6, tilt: 4.5, scale: 0.55 }
      : { shift: 72, drop: 10, tilt: 7, scale: 0.42 };
  return {
    x: `${-50 + side * shift}%`,
    y: drop,
    rotate: side * tilt,
    scale,
  };
}

// The box every photo starts from, and the box the chevrons have to sit in:
// the active photo never moves, so the overlay can borrow the same anchoring.
const PHOTO_BOX = "absolute bottom-0 left-1/2 aspect-[4/3] w-[58%]";

// A lone photo has no fan to sit in the middle of, so it takes more of the
// stage rather than floating there at fan size.
const SOLO_BOX = "absolute bottom-0 left-1/2 aspect-[4/3] w-[72%]";
const STAGE_ASPECT = "aspect-[2.3/1]";
const SOLO_STAGE_ASPECT = "aspect-[1.85/1]";

// The wash is the photo itself, blurred past recognition. It reaches past the
// stage, because the part behind the photos is the part nobody can see, and
// stops well inside the shell so nothing smears onto the page. The mask keeps
// the clip from reading as a rectangle of colour.
const WASH_BOX = "absolute -inset-x-[10%] -top-4 bottom-0 z-0 overflow-hidden";
const WASH_MASK =
  "radial-gradient(75% 75% at 50% 50%, black 55%, transparent 100%)";

// Same corner treatment as the counter on the cards.
const PHOTO_BADGE_CLASS =
  "absolute right-1.5 bottom-1.5 h-5 bg-background/80 px-1.5 text-[10px] tabular-nums shadow-xs backdrop-blur-sm";

// The window walks around the list, so the active photo is always in the
// middle and every photo stays reachable however many there are.
function fanSlots(count: number, active: number): { index: number; offset: number }[] {
  // Two photos have no middle to walk around. Wrapping put the other one on
  // the right both times, which read as a mistake; keeping it on the side it
  // belongs on by number means it swaps sides as you switch, and the pair
  // stays balanced whichever one you are looking at.
  if (count === 2) {
    return [
      { index: 0, offset: 0 - active },
      { index: 1, offset: 1 - active },
    ];
  }
  const span = Math.min(count, FAN_LIMIT);
  const half = Math.floor((span - 1) / 2);
  const slots = [];
  for (let offset = -half; offset <= span - 1 - half; offset++) {
    slots.push({ index: (active + offset + count) % count, offset });
  }
  return slots;
}

export function PhotoSpread({ animal }: { animal: Animal }) {
  const { messages, t } = useI18n();
  const shouldReduceMotion = useReducedMotion();
  const images = permittedImageUrls(animal.images);
  const [activeIndex, setActiveIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  // The cascade belongs to the mount, which is once per animal: the first
  // render reads false, and every render after it is a photo being picked.
  const entered = useRef(false);
  useEffect(() => {
    entered.current = true;
  }, []);

  if (images.length === 0) {
    return (
      <PhotoGallery
        animal={animal}
        sizes="(max-width: 639px) 100vw, 24rem"
        className="relative aspect-[4/3] w-full overflow-hidden bg-muted sm:mx-auto sm:w-[58%] sm:rounded-ui sm:border"
      />
    );
  }

  const solo = images.length === 1;
  const slots = fanSlots(images.length, activeIndex);

  function step(direction: -1 | 1) {
    setActiveIndex(
      (current) => (current + direction + images.length) % images.length,
    );
  }

  return (
    <>
      {/* Phones get the photo full width with the swipe it always had, and a
          row of thumbs to jump around with. */}
      <div data-slot="photo-hero" className="sm:hidden">
        <PhotoGallery
          animal={animal}
          sizes="100vw"
          index={activeIndex}
          onIndexChange={setActiveIndex}
          className="relative aspect-[4/3] overflow-hidden bg-muted"
        />
        {images.length > 1 && (
          <div
            data-slot="photo-thumbs"
            className="flex gap-2 overflow-x-auto px-4 pt-4 no-scrollbar"
          >
            {images.map((source, index) => (
              <button
                key={source}
                type="button"
                onClick={() => setActiveIndex(index)}
                aria-pressed={index === activeIndex}
                aria-label={t("showPhoto", { n: index + 1 })}
                className={cn(
                  "relative size-14 shrink-0 overflow-hidden rounded-ui border bg-muted transition-opacity",
                  index === activeIndex
                    ? "ring-2 ring-[var(--filter-accent-border)]"
                    : "opacity-60",
                )}
              >
                <Image
                  src={source}
                  alt=""
                  fill
                  sizes="4rem"
                  className="object-cover"
                />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Wider screens get the whole set at once: the chosen one large in the
          middle, the rest tilted and tucked behind it. */}
      <div
        data-slot="photo-spread"
        // Arrows walk the fan while focus is anywhere inside it, and the
        // page must not scroll out from under the visitor doing it.
        onKeyDown={(event) => {
          if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
          event.preventDefault();
          step(event.key === "ArrowLeft" ? -1 : 1);
        }}
        className={cn(
          "group relative mx-auto hidden w-[80%] sm:block",
          solo ? SOLO_STAGE_ASPECT : STAGE_ASPECT,
        )}
      >
        {/* The photo's own colour, blurred out behind the fan, so the stage
            is lit by whatever is on it. */}
        <div
          aria-hidden
          className={cn("pointer-events-none", WASH_BOX)}
          style={{ maskImage: WASH_MASK, WebkitMaskImage: WASH_MASK }}
        >
          <AnimatePresence initial={false}>
            <m.div
              key={activeIndex}
              className="absolute inset-0"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={shouldReduceMotion ? { duration: 0 } : FAN_SPRING}
            >
              <Image
                src={images[activeIndex]}
                alt=""
                fill
                sizes="48rem"
                className="scale-125 object-cover opacity-30 blur-2xl saturate-150"
              />
            </m.div>
          </AnimatePresence>
        </div>

        {slots
          .slice()
          .sort((a, b) => a.index - b.index)
          // The cascade is chosen from the mount marker below, which has to be
          // read where the transition is built. The read is idempotent, so a
          // re-render cannot land on a different answer.
          // eslint-disable-next-line react-hooks/refs
          .map(({ index, offset }) => {
            const pose = fanPose(offset);
            const active = offset === 0;
            const rotate =
              active || shouldReduceMotion
                ? pose.rotate
                : pose.rotate + TILT_NUDGE[index % TILT_NUDGE.length];
            return (
              <m.button
                key={index}
                type="button"
                onClick={() =>
                  active ? setLightboxOpen(true) : setActiveIndex(index)
                }
                aria-pressed={active}
                aria-label={
                  active
                    ? t("viewPhotoLarge", { n: index + 1 })
                    : t("showPhoto", { n: index + 1 })
                }
                style={{ zIndex: 20 - Math.abs(offset) }}
                className={cn(
                  solo ? SOLO_BOX : PHOTO_BOX,
                  // A photo edge has to read against the photo, not against
                  // the surface behind it, so the border is drawn from the
                  // foreground: dark on light, light on dark.
                  "origin-bottom overflow-hidden rounded-ui border border-foreground/10 bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active
                    ? "cursor-zoom-in shadow-sm"
                    : "shadow-xs brightness-95 transition-[filter] duration-150 hover:brightness-100",
                )}
                initial={
                  shouldReduceMotion
                    ? false
                    : { ...pose, rotate, opacity: 0, y: pose.y + 8 }
                }
                animate={{ ...pose, rotate, opacity: 1 }}
                // Hovering a photo from the stack straightens it and lifts it
                // a little, so it reads as the thing a click would pick.
                whileHover={
                  active || shouldReduceMotion
                    ? undefined
                    : {
                        scale: pose.scale * 1.08,
                        rotate: rotate * 0.3,
                        y: pose.y - 4,
                      }
                }
                transition={
                  shouldReduceMotion
                    ? { duration: 0 }
                    : {
                        ...FAN_SPRING,
                        delay: entered.current
                          ? 0
                          : Math.abs(offset) * ENTRANCE_STAGGER,
                      }
                }
              >
                <Image
                  src={images[index]}
                  alt=""
                  fill
                  sizes="(max-width: 639px) 100vw, 24rem"
                  className="object-cover"
                />
                {/* The count sits on the photo being looked at, and it is
                    what tells you how many there are in total. */}
                {active && images.length > 1 && (
                  <Badge
                    aria-hidden
                    variant="secondary"
                    className={PHOTO_BADGE_CLASS}
                  >
                    {activeIndex + 1} / {images.length}
                  </Badge>
                )}
              </m.button>
            );
          })}

        {/* Over the active photo, in the same box it occupies. Hidden until
            the fan is hovered or focused, exactly like the card gallery. */}
        {images.length > 1 && (
          <div
            className={cn(PHOTO_BOX, "pointer-events-none z-30 -translate-x-1/2")}
          >
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              onClick={() => step(-1)}
              aria-label={messages.previousPhoto}
              className={`${GALLERY_BUTTON_CLASS} pointer-events-auto left-1.5`}
            >
              <ChevronLeft className="size-4" aria-hidden />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              onClick={() => step(1)}
              aria-label={messages.nextPhoto}
              className={`${GALLERY_BUTTON_CLASS} pointer-events-auto right-1.5`}
            >
              <ChevronRight className="size-4" aria-hidden />
            </Button>
          </div>
        )}

        {/* Lives inside the fan, so only the layout on screen announces
            itself: the phone hero brings its own counter. */}
        {images.length > 1 && (
          <span className="sr-only" aria-live="polite" aria-atomic="true">
            {t("photoCount", {
              current: activeIndex + 1,
              total: images.length,
            })}
          </span>
        )}
      </div>

      <PhotoLightbox
        open={lightboxOpen}
        onOpenChange={setLightboxOpen}
        images={images}
        index={activeIndex}
        onIndexChange={setActiveIndex}
        title={animal.name ?? messages.unnamed}
      />
    </>
  );
}
