"use client";

import { useRef, useState } from "react";
import { LazyMotion, domAnimation } from "motion/react";
import { PhotoLightbox } from "@/components/animal-dialog/photo-lightbox";
import { useAnimalPagePhoto } from "@/components/animal-page-photo-state";
import { useI18n } from "@/components/i18n-provider";
import { PhotoGallery } from "@/components/photo-gallery";
import type { PermittedPhoto } from "@/lib/animal-images";

/** The standalone page keeps its plain gallery and opens the full-image
 *  viewer on tap. Selection is shared with the page's Share control. */
export function AnimalPageGallery({
  images,
  name,
  sizes,
  className,
}: {
  /** Already resolved and already free of anything no surface may draw. */
  images: PermittedPhoto[];
  name?: string | null;
  sizes: string;
  className?: string;
}) {
  const { index, onIndexChange } = useAnimalPagePhoto();
  const { messages } = useI18n();
  const [open, setOpen] = useState(false);
  const [origin, setOrigin] = useState<DOMRect>();
  const galleryRef = useRef<HTMLDivElement | null>(null);

  return (
    <div ref={galleryRef} className="min-w-0">
      <PhotoGallery
        images={images}
        name={name}
        sizes={sizes}
        index={index}
        onIndexChange={onIndexChange}
        onOpenPhoto={(rect) => {
          setOrigin(rect);
          setOpen(true);
        }}
        showCount
        // The shared photo arriving after hydration is not a user action to
        // announce. Gallery steps still turn on its own live position line.
        eager
        avif
        className={className}
      />
      <LazyMotion features={domAnimation}>
        <PhotoLightbox
          open={open}
          onOpenChange={setOpen}
          images={images}
          index={index}
          onIndexChange={onIndexChange}
          title={name ?? messages.unnamed}
          originRect={origin}
          returnFocusFallback={() => galleryRef.current?.querySelector("button")}
        />
      </LazyMotion>
    </div>
  );
}
