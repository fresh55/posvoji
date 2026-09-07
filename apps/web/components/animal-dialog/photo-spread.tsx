"use client";

import { PhotoLightbox } from "@/components/animal-dialog/photo-lightbox";
import { type WashLayer } from "@/components/animal-dialog/photo-wash";
import { useI18n } from "@/components/i18n-provider";
import { PhotoGallery } from "@/components/photo-gallery";
import type { ClientAnimal } from "@/lib/animal";
import { FAN_PHOTO_SIZES } from "@/lib/animal-images";
import { clampPhotoIndex } from "@/lib/animal-path";
import { preloadPhotos } from "@/lib/preload-photos";
import { type MotionValue } from "motion/react";
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { frontPrintOf } from "./fan-focus";
import { enteringSlots, fanSlots, fanTempo } from "./fan-geometry";
import { DESKTOP_FAN, PHONE_FAN, useDesktopFan } from "./fan-layout";
import { Fan } from "./photo-fan";

/**
 * The dialog's photographs: the fan, and the lightbox it opens into.
 *
 * Memoised, and every prop the dialog hands it is already stable. Without it
 * every step through the photos rendered this whole subtree twice: the stage
 * wash above holds its layers in state, this component's layout effect writes
 * them, and the render that answers came back down through here.
 */
export const PhotoSpread = memo(function PhotoSpread({
  animal,
  initialIndex = 0,
  onIndexChange,
  washProgress,
  onWashWindow,
}: {
  animal: ClientAnimal;
  /** Which photo to open on. A shared link can name one; anything out of
   *  range falls back to the first, the same as no link at all. */
  initialIndex?: number;
  /** Reports the photo on show, so the share link can name it. */
  onIndexChange?: (index: number) => void;
  /**
   * The wash's copy of the fan's walk. Written by the fan, read by the wash
   * above.
   */
  washProgress?: MotionValue<number>;
  /**
   * The photos the stage wash should be holding, and where each of them stands
   * in the fan. The wash is mounted above this component so it outlives the
   * remount, which is the only way one animal's colour can fade into the next
   * one's.
   */
  onWashWindow?: (layers: WashLayer[]) => void;
}) {
  const { messages } = useI18n();
  // Already resolved and already filtered to what may be drawn.
  const images = animal.images;
  const [activeIndex, setActiveIndex] = useState(() =>
    clampPhotoIndex(initialIndex, images.length),
  );
  useEffect(() => {
    onIndexChange?.(activeIndex);
  }, [onIndexChange, activeIndex]);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxOrigin, setLightboxOrigin] = useState<DOMRect | undefined>(
    undefined,
  );
  // Which view the next visit opens on. The lightbox reads it on every open
  // and holds the visitor's own switching itself, so this only has to say what
  // was clicked to get there.
  const [lightboxView, setLightboxView] = useState<"photo" | "sheet">("photo");
  // One object per animal, because the fan's effects read it as a dependency.
  const tempo = useMemo(() => fanTempo(animal.energy), [animal.energy]);
  // Which set of numbers the fan stands in. One fan, not two: the geometry is
  // read here rather than left to sm:hidden, so the layout that is not on
  // screen is not in the document either.
  const geometry = useDesktopFan() ? DESKTOP_FAN : PHONE_FAN;
  // Both of these outlive the fan on purpose. The stage, because the lightbox
  // below has to ask it where focus belongs on the way out; the marker,
  // because the breakpoint remounts the fan and a print holding focus goes
  // with it.
  const stageRef = useRef<HTMLDivElement | null>(null);
  const keptFocusRef = useRef(false);

  // Held across renders so the prints below can be memoised: a print handed a
  // fresh way into the lightbox on every render is a print that re-renders on
  // every render.
  const openLightbox = useCallback(
    (from: DOMRect, view: "photo" | "sheet" = "photo") => {
      setLightboxOrigin(from);
      setLightboxView(view);
      setLightboxOpen(true);
    },
    [],
  );
  const openSheet = useCallback(
    (from: DOMRect) => openLightbox(from, "sheet"),
    [openLightbox],
  );

  // Where the lightbox hands focus back when the print it was opened from has
  // left the fan's window. The front print is the answer, and there is always
  // one: this component draws the gallery instead when there are no photos at
  // all. Nothing is returned if it somehow is not there, which leaves the
  // restore to the lightbox's own dialog rather than sending focus to an
  // element that cannot take it.
  const returnFocusToFan = useCallback(
    () => frontPrintOf(stageRef.current),
    [stageRef],
  );

  // Reported rather than read from above, because which photos are on stage is
  // this component's business. An animal with nothing to show reports nothing
  // and the wash goes out with it.
  // The wash runs off the 112px thumb, which is derived from the cached copy
  // and named after it, so it is the photo's own src the wash needs.
  //
  // The front photo and its two neighbours, and not the whole window: every
  // layer is a blurred image, which is the most expensive thing on the stage,
  // and the two outer offsets only ever showed during a two-step walk. There
  // the colour now arrives when the step lands rather than while it runs.
  const washLayers = useMemo(
    () =>
      fanSlots(images.length, activeIndex)
        .filter(({ offset }) => Math.abs(offset) <= 1)
        .map(({ index, offset }) => ({
          offset,
          source: images[index].src,
        })),
    [images, activeIndex],
  );
  // A layout effect, not an effect. A step commits by re-seating the fan and
  // jumping its progress to zero in one paint, and layers arriving a paint
  // later would put the old photo's wash back at full weight for a frame.
  // React flushes a state update made in a layout effect before the browser
  // paints, which is what closes that gap.
  useLayoutEffect(() => {
    onWashWindow?.(washLayers);
  }, [onWashWindow, washLayers]);

  // Only the five on stage are mounted, so a step past the edge used to pop a
  // blank frame in and fill it afterwards. Everything a gesture could bring in
  // is fetched as soon as the front changes, a hard flick's two steps
  // included: enteringSlots reaches one tier further out than a single step
  // does. That is why there is nothing to warm when a gesture starts. The set
  // keeps a photo from being asked for twice.
  const preloaded = useRef(new Set<string>());
  useEffect(() => {
    preloadPhotos(
      enteringSlots(images.length, activeIndex).map((index) => images[index]),
      FAN_PHOTO_SIZES,
      preloaded.current,
    );
  }, [images, activeIndex]);

  if (images.length === 0) {
    return (
      <PhotoGallery
        images={images}
        name={animal.name}
        sizes="(max-width: 639px) 100vw, 24rem"
        className="relative aspect-[4/3] w-full overflow-hidden bg-muted sm:mx-auto sm:w-[58%] sm:rounded-ui sm:border"
      />
    );
  }

  return (
    <>
      {/* One recipe, two sets of numbers, and the breakpoint above picks which
          it is drawn in. Wider screens get the whole set at once: the chosen
          one large in the middle, the rest tilted and tucked behind it. The
          phone used to get a full-width hero with a thumbnail strip, which
          spent 365px saying what the fan says in less: which photo is on show,
          that there are more, and where you are among them. The wash that used
          to sit here is mounted by the dialog now, so it survives this
          component being remounted for the next animal.

          Keyed on the geometry: a resize across the breakpoint remounts the
          fan rather than re-seating five prints under a new set of numbers.
          The entrance cascade replays when that happens, which is accepted;
          the photo on show does not change, because the index is held here. */}
      <Fan
        key={geometry.slot}
        geometry={geometry}
        images={images}
        name={animal.name ?? messages.unnamed}
        activeIndex={activeIndex}
        tempo={tempo}
        washProgress={washProgress}
        stageRef={stageRef}
        keptFocusRef={keptFocusRef}
        onSelect={setActiveIndex}
        onOpenLightbox={openLightbox}
        onOpenSheet={openSheet}
      />

      <PhotoLightbox
        open={lightboxOpen}
        onOpenChange={setLightboxOpen}
        images={images}
        index={activeIndex}
        onIndexChange={setActiveIndex}
        title={animal.name ?? messages.unnamed}
        originRect={lightboxOrigin}
        initialView={lightboxView}
        // Stepping inside the lightbox walks the fan behind it, so the print
        // it was opened from can be two seats out and unmounted by the time
        // it closes. The print now in front is where focus belongs then.
        returnFocusFallback={returnFocusToFan}
      />
    </>
  );
});
export { frontPrintOf } from "./fan-focus";
export {
  DESKTOP_DEPTHS,
  fanTempo,
  PHONE_DEPTHS,
  seatCentre,
} from "./fan-geometry";
export type { FanFactors, FanTempo } from "./fan-geometry";
