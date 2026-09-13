"use client";

import { useState, type ReactNode } from "react";
import {
  photoAvifUrl,
  photoSrcSet,
  subjectPosition,
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
  /** Width over height of the box this photo covers, so a "subject" crop can
   *  put the animal in it rather than the middle of the file (see
   *  subjectPosition). Left out, the crop knows only the photo's own shape
   *  and can do no better than bias a portrait upward. */
  frame?: number;
  /** Drawn over the box while this photo is one that failed to arrive, for a
   *  surface that has something to say about it. The hiding below happens
   *  either way: this is the caller's chance to fill the ground, not the
   *  photo's only handling. Left out by every surface that would rather show
   *  its own empty box than a sentence about one missing picture. */
  fallback?: ReactNode;
};

// What a portrait gets when nothing better is known about it. A portrait shot
// centred in a 4:3 box loses the head. Heads sit in the top third of one, and
// a 4:3 box shows 56% of a 3:4 photo's height: centred that cuts 22% off the
// top, from 20% down it cuts 9%. Landscape and square photos need none of it,
// and `aspect` is absent exactly when the photo rounds to the 4:3 the box
// already is.
//
// Where ingest found the animal, the box it found wins over this guess: a
// caller that says what shape its frame is gets the position that keeps the
// whole animal in it, on whichever axis the frame cuts. Both read off what
// ingest measured, so either way it is a plain render decision: no onLoad, no
// state, and the first paint is already anchored.
const SUBJECT_OBJECT_POSITION = "50% 20%";

// Marks a photo that had not arrived when the element was handed over, which
// the load handler below takes off again. See the class list on the <img>: the
// mark is opacity 0 and its removal is a short fade, so a file landing after
// hydration arrives as one picture rather than cutting in over the placeholder.
//
// Hoisted rather than written inline, so it is one function and not a new one
// per render: React re-runs a ref whose identity changed, and inline this ran
// again on every state change here, re-marking a photo the load had just
// cleared.
function markArriving(node: HTMLImageElement | null) {
  if (node && !node.complete) node.dataset.arriving = "true";
}

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
  frame,
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
  // Worked out once and handed to both layers, because the placeholder and the
  // photo are the same picture in the same box and have to be cropped the same
  // way. The placeholder used to be bg-center whatever the photo did, so on a
  // portrait lead photo the head sat low in the blur and jumped up the moment
  // the file landed, and a subject crop that moves the photo further from the
  // middle would have made the jump bigger.
  //
  // undefined is the box's own default, which for both layers is the middle:
  // object-position defaults to 50% 50% and the placeholder keeps bg-center
  // below.
  const objectPosition =
    crop === "subject"
      ? ((frame !== undefined ? subjectPosition(photo, frame) : undefined) ??
        (portrait ? SUBJECT_OBJECT_POSITION : undefined))
      : undefined;

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
      // Written to the node and never to the server's markup, which is what
      // keeps the fade out of hydration. A photo that is already complete when
      // this runs, which is every photo a warm cache serves, is never marked
      // and never fades: the mark is only ever about the wait. See
      // markArriving above.
      ref={markArriving}
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
      // It is also where the photo the ref above marked stops waiting, which
      // is the fade.
      onLoad={(event) => {
        event.currentTarget.hidden = false;
        delete event.currentTarget.dataset.broken;
        delete event.currentTarget.dataset.arriving;
        setFailedSrc((current) => (current === photo.src ? null : current));
      }}
      // The fade is written as utilities here rather than as a rule of its own,
      // and it is the caller's class list that decides whether it survives: cn
      // merges the two, and two transition utilities on one element are one
      // property, not two. The grid card animates the hover zoom on this same
      // image, so it names both properties at once
      // (motion-safe:transition-[transform,opacity] in photo-gallery.tsx); a
      // caller that names transform alone would take the fade off without
      // saying so.
      //
      // motion-safe on the mark as well as on the transition, so a visitor who
      // asked for less motion gets the photo at once rather than an untransitioned
      // jump from an invisible one.
      className={cn(
        "absolute inset-0 size-full motion-safe:transition-opacity motion-safe:duration-200 motion-safe:data-[arriving]:opacity-0",
        className,
      )}
      style={objectPosition ? { objectPosition } : undefined}
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
          style={{
            backgroundImage: `url("${placeholder}")`,
            backgroundPosition: objectPosition,
          }}
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
