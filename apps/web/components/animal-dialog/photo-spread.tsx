"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { m, useReducedMotion } from "motion/react";
import type { Animal } from "@posvoji/schema";
import { PhotoLightbox } from "@/components/animal-dialog/photo-lightbox";
import {
  STAGE_WIDTH,
  StripWash,
} from "@/components/animal-dialog/photo-wash";
import { useI18n } from "@/components/i18n-provider";
import {
  GALLERY_BUTTON_CLASS,
  PhotoGallery,
} from "@/components/photo-gallery";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { permittedImageUrls, thumbnailUrl } from "@/lib/animal-images";
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

// Past this remainder the edge counts as reached, so the fade never blocks
// the last few pixels of content.
const THUMB_EDGE_SLACK_PX = 8;

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

// Images are served unoptimized today, so this picks nothing; it is here so
// the fan asks for the right file if that ever changes. The wash behind the
// fan runs off the thumb instead and carries its own.
const PHOTO_SIZES = "(max-width: 639px) 100vw, 24rem";

// The dialog counts photos where the grid card shows dots: the card is a
// thumbnail whose gallery is incidental, and this is the surface someone came
// to to look through them, where "4 / 12" is the useful answer.
const PHOTO_BADGE_CLASS =
  "absolute right-1.5 bottom-1.5 h-5 bg-background/80 px-1.5 text-3xs tabular-nums shadow-xs backdrop-blur-sm";

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

export function PhotoSpread({
  animal,
  onWashSource,
}: {
  animal: Animal;
  /**
   * Which photo the stage wash should be showing. The wash is mounted above
   * this component so it outlives the remount, which is the only way one
   * animal's colour can fade into the next one's.
   */
  onWashSource?: (source: string | undefined) => void;
}) {
  const { messages, t } = useI18n();
  const shouldReduceMotion = useReducedMotion();
  const images = permittedImageUrls(animal.images);
  const [activeIndex, setActiveIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxOrigin, setLightboxOrigin] = useState<DOMRect | undefined>(
    undefined,
  );
  // The cascade belongs to the mount, which is once per animal: the first
  // render reads false, and every render after it is a photo being picked.
  const entered = useRef(false);
  useEffect(() => {
    entered.current = true;
  }, []);

  // Reported rather than read from above, because which photo is showing is
  // this component's business. An animal with nothing to show reports nothing
  // and the wash goes out with it.
  const washSource = images[activeIndex];
  useEffect(() => {
    onWashSource?.(washSource);
  }, [onWashSource, washSource]);

  // The travelling ring is measured off the thumb it is going to rather than
  // worked out from the gap, so it stays right if the strip's sizing changes.
  const thumbsRef = useRef<HTMLDivElement>(null);
  const [ring, setRing] = useState<
    { x: number; y: number; w: number; h: number } | undefined
  >(undefined);
  useEffect(() => {
    const thumb =
      thumbsRef.current?.querySelectorAll<HTMLElement>("[data-thumb]")[
        activeIndex
      ];
    if (!thumb) return;
    setRing({
      x: thumb.offsetLeft,
      y: thumb.offsetTop,
      w: thumb.offsetWidth,
      h: thumb.offsetHeight,
    });
  }, [activeIndex, images.length]);

  // The strip hides its scrollbar, so nothing else says there is more to
  // find sideways. This drives fade-scroll-x the same way filter-sidebar.tsx
  // drives the vertical fade, just measured across scrollLeft instead.
  useEffect(() => {
    const el = thumbsRef.current;
    if (!el) return;

    const update = () => {
      const fadeStart = el.scrollLeft > THUMB_EDGE_SLACK_PX;
      const fadeEnd =
        el.scrollLeft + el.clientWidth < el.scrollWidth - THUMB_EDGE_SLACK_PX;
      el.style.setProperty("--scroll-fade-start", fadeStart ? "1" : "0");
      el.style.setProperty("--scroll-fade-end", fadeEnd ? "1" : "0");
    };

    update();
    el.addEventListener("scroll", update, { passive: true });
    if (typeof ResizeObserver === "undefined") {
      return () => el.removeEventListener("scroll", update);
    }
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, [images.length]);

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
          <div className="relative">
            {/* The hero's colour carried a little way down, so the strip reads
                as the bottom of the photo rather than a tray under it. It sits
                outside the scroller on purpose: walking the thumbs sideways
                must not drag or repaint the blurred layer. */}
            <StripWash source={washSource} />
            <div
              ref={thumbsRef}
              data-slot="photo-thumbs"
              className="relative z-10 flex gap-2 overflow-x-auto px-4 pt-4 fade-scroll-x"
            >
              {/* One ring that travels, rather than one per thumb blinking on
                  and off. It is laid out in the scroller's own coordinates, so
                  it rides along with the thumbs instead of drifting when the
                  strip is scrolled mid-slide. */}
              {ring && (
                <m.div
                  aria-hidden
                  data-slot="photo-thumb-ring"
                  className="pointer-events-none absolute top-0 left-0 z-10 rounded-ui ring-2 ring-[var(--filter-accent-border)]"
                  style={{ width: ring.w, height: ring.h }}
                  initial={false}
                  animate={{ x: ring.x, y: ring.y }}
                  transition={shouldReduceMotion ? { duration: 0 } : FAN_SPRING}
                />
              )}
              {images.map((source, index) => (
                <button
                  key={source}
                  data-thumb
                  type="button"
                  onClick={() => setActiveIndex(index)}
                  aria-pressed={index === activeIndex}
                  aria-label={t("showPhoto", { n: index + 1 })}
                  className={cn(
                    "relative size-14 shrink-0 overflow-hidden rounded-ui border bg-muted transition-opacity",
                    index !== activeIndex && "opacity-60",
                  )}
                >
                  <Image
                    src={thumbnailUrl(source)}
                    alt=""
                    fill
                    sizes="4rem"
                    className="object-cover"
                  />
                </button>
              ))}
            </div>
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
          "group relative mx-auto hidden sm:block",
          STAGE_WIDTH,
          solo ? SOLO_STAGE_ASPECT : STAGE_ASPECT,
        )}
      >
        {/* The wash that used to sit here is mounted by the dialog now, so it
            survives this component being remounted for the next animal. */}
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
                onClick={(event) => {
                  if (!active) {
                    setActiveIndex(index);
                    return;
                  }
                  // Where it is standing right now, so the lightbox can grow
                  // out of it rather than appear over it.
                  setLightboxOrigin(event.currentTarget.getBoundingClientRect());
                  setLightboxOpen(true);
                }}
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
                  sizes={PHOTO_SIZES}
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
        originRect={lightboxOrigin}
      />
    </>
  );
}
