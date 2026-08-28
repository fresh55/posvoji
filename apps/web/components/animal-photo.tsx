import {
  photoAvifUrl,
  photoSrcSet,
  type PermittedPhoto,
} from "@/lib/animal-images";
import { cn } from "@/lib/utils";

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
  /** Serve the AVIF sibling where one exists. Opt-in per surface, because
   *  ingest derives AVIF at the cached copy's own width and no other: a
   *  single-candidate <source> wins over the whole WebP ladder, so it is only
   *  a saving on a surface that would ask for the top rung anyway. */
  avif?: boolean;
  /** Paint the inline placeholder under the photo. Off for a photo that does
   *  not cover its box, where a cover-scaled blur would show around the
   *  edges. */
  blur?: boolean;
};

export function AnimalPhoto({
  photo,
  alt,
  sizes,
  className,
  eager = false,
  avif = false,
  blur = true,
}: AnimalPhotoProps) {
  const srcSet = photoSrcSet(photo);
  const avifSrc = avif ? photoAvifUrl(photo) : undefined;
  const placeholder = blur ? photo.blurDataURL : undefined;

  const image = (
    // The rule asks for next/image so the image gets a srcset. Under
    // images.unoptimized next/image is the one that emits none, and this is
    // where the srcset comes from instead. See the note at the top of the file.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={photo.src}
      srcSet={srcSet}
      // Only alongside a srcset. On its own it describes a choice there is
      // nothing to make.
      sizes={srcSet ? sizes : undefined}
      alt={alt}
      loading={eager ? "eager" : "lazy"}
      fetchPriority={eager ? "high" : undefined}
      decoding="async"
      className={cn("absolute inset-0 size-full", className)}
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
    </>
  );
}
