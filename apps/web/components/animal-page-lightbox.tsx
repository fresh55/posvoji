"use client";

import { domAnimation } from "motion/react";
import { LazyMotion } from "@/components/motion-scope";
import { PhotoLightbox } from "@/components/animal-dialog/photo-lightbox";
import type { ComponentProps } from "react";

export function AnimalPageLightbox(
  props: ComponentProps<typeof PhotoLightbox>,
) {
  return (
    <LazyMotion features={domAnimation}>
      <PhotoLightbox {...props} />
    </LazyMotion>
  );
}
