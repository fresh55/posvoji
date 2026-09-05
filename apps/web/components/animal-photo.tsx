"use client";

import { useState, type ReactNode } from "react";
import {
  photoAvifUrl,
  photoSrcSet,
  type PermittedPhoto,
} from "@/lib/animal-images";
import { cn } from "@/lib/utils";

// A client component since the error handler below: a server component may
// not put a handler on an element, and this is drawn from both sides of the
// boundary. Everything it takes is plain data, so nothing else changes.
//
// A plain <img>, not next/image.
//
// The site is a static export with no image server, so next.config.ts sets
// images.unoptimized, and that makes next/image emit a bare <img> with no
// srcset at all: one candidate at every width, which is how a 375px phone
// ended up downloading the 800px file. The alternatives were a custom loader
// or this. A loader is handed a width off deviceSizes and has no way to reach
// the per-image `widths`, so it would have to guess file names for rungs that
// were never written; this reads the ladder ingest actually produced and can
// therefore only ever name a file that exists.
//
// The layout matches next/image's `fill`: absolutely positioned to the
// caller's box, which owns the aspect ratio, the clipping and the corners.

type AnimalPhotoProps = {
  photo: PermittedPhoto;
  alt: string;
  /** The rendered CSS width of this photo, per viewport. Must be truthful:
   *  understating it picks a rung too small and the photo goes soft. */
  sizes: string;
  /** Goes on the <img>, so object-fit and any animation stay the caller's. */
  className?: string;
  /** Above the fold. Loads at once and asks for the front of the queue,
   *  which is what the deprecated `priority` prop did on next/image. */
  eager?: boolean;
  /** Load at once without asking for the front of the queue: a photo that is
   *  on screen from the start but is not the one being looked at, such as the
   *  prints beside the front one in the dialog's fan. `eager` wins where both
   *  are set. */
  loading?: "eager" | "lazy";
  /** Serve the AVIF sibling where one exists. Opt-in per surface, because
   *  ingest derives AVIF at the cached copy's own width and no other: a
   *  single-candidate <source> wins over the whole WebP ladder, so it is only
   *  a saving on a surface that would ask for the top rung anyway. */
  avif?: boolean;
  /** Paint the inline placeholder under the photo. Off for a photo that does
   *  not cover its box, where a cover-scaled blur would show around the
   *  edges. */
  blur?: boolean;
  /** Where the photo sits in a box that crops it. "subject" biases a portrait
   *  shot upward; "center" is for a surface that contains the photo rather
   *  than covering, where the bias would only shove it off the middle. */
  crop?: "subject" | "center";
  /** Drawn over the box while this photo is one that failed to arrive, for a
   *  surface that has something to say about it. The hiding below happens
   *  either way: this is the caller's chance to fill the ground, not the
   *  photo's only handling. Left out by every surface that would rather show
   *  its own empty box than a sentence about one missing picture. */
  fallback?: ReactNode;
};

// A portrait shot centred in a 4:3 box loses the head. Heads sit in the top
// third of one, and a 4:3 box shows 56% of a 3:4 photo's height: centred that
// cuts 22% off the top, from 20% down it cuts 9%. Landscape and square photos
// need none of it, and `aspect` is absent exactly when the photo rounds to the
// 4:3 the box already is.
//
// It reads off the aspect ingest measured, so it is a plain render decision:
// no onLoad, no state, and the first paint is already anchored.
const SUBJECT_OBJECT_POSITION = "50% 20%";

export function AnimalPhoto({
  photo,
  alt,
  sizes,
  className,
  eager = false,
  loading = "lazy",
  avif = false,
  blur = true,
  crop = "subject",
  fallback,
}: AnimalPhotoProps) {
  // The photo that failed to arrive, held by its source rather than by the
  // element it failed on: a surface that keeps this component mounted and hands
  // it one photo after another (the lightbox) is naming a different file each
  // time. A step to another picture therefore says nothing about that one, and
  // a step back says the same thing it said before.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const srcSet = photoSrcSet(photo);
  const avifSrc = avif ? photoAvifUrl(photo) : undefined;
  const placeholder = blur ? photo.blurDataURL : undefined;
  const portrait = crop === "subject" && photo.aspect !== undefined && photo.aspect < 1;

  const image = (
    // The rule asks for next/image so the image gets a srcset. Under
    // images.unoptimized next/image is the one that emits none, and this is
    // where the srcset comes from instead. See the note at the top of the file.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      // The failure below belongs to the file that failed, not to whatever
      // element happens to be standing here. A surface that keeps this
      // component mounted and hands it one photo after another (the lightbox)
      // reuses the same <img>, so without the key a photo that failed would
      // leave the next one hidden behind its flag.
      key={photo.src}
      src={photo.src}
      srcSet={srcSet}
      // Only alongside a srcset. On its own it describes a choice there is
      // nothing to make.
      sizes={srcSet ? sizes : undefined}
      alt={alt}
      loading={eager ? "eager" : loading}
      fetchPriority={eager ? "high" : undefined}
      decoding="async"
      // A photo that fails to arrive (a cached copy renamed under a stale
      // page, a shelter file gone) would otherwise sit as a broken image over
      // the box's own ground. Hidden, the ground shows instead, which is the
      // same thing the box shows while a photo is still on its way. Written
      // to the element rather than to state: nothing else needs to know.
      onError={(event) => {
        event.currentTarget.hidden = true;
        event.currentTarget.dataset.broken = "true";
        setFailedSrc(photo.src);
      }}
      // The way back out. A browser may pick another rung off the srcset and
      // retry on this same element, and a load that arrives after a failure
      // is that failure being over: the key above answers for a new source,
      // this answers for the same one arriving late.
      // A browser may retry a failed photo on another rung of its srcset, and a
      // load that lands afterwards is that failure being over. Only the source
      // being complained about clears it, so a photo arriving somewhere else in
      // the set cannot take the line off a different one.
      onLoad={(event) => {
        event.currentTarget.hidden = false;
        delete event.currentTarget.dataset.broken;
        setFailedSrc((current) => (current === photo.src ? null : current));
      }}
      className={cn("absolute inset-0 size-full", className)}
      style={portrait ? { objectPosition: SUBJECT_OBJECT_POSITION } : undefined}
    />
  );

  return (
    <>
      {/* Under the photo, in the same box, never on top of it: the photo is
          opaque and covers its frame, so the placeholder simply stops being
          visible once it paints. No state, no fade to unmount, and nothing
          that needs the client. */}
      {placeholder && (
        <div
          aria-hidden
          className="absolute inset-0 size-full bg-cover bg-center"
          style={{ backgroundImage: `url("${placeholder}")` }}
        />
      )}
      {avifSrc ? (
        // <picture> is display: inline and positions nothing, so the img
        // inside keeps laying itself out against the caller's box.
        //
        // The AVIF is one candidate with no width descriptor, deliberately: it
        // exists at a single width, and a `w` descriptor would invite the
        // browser to compare it against a ladder that is not in this source.
        <picture>
          <source type="image/avif" srcSet={avifSrc} />
          {image}
        </picture>
      ) : (
        image
      )}
      {/* Over the ground the hidden photo left, and only ever about the photo
          standing here now. The failure outlives a step to another picture on
          purpose: a caller coming back to one that failed is told the same
          thing again. */}
      {failedSrc === photo.src && fallback}
    </>
  );
}
