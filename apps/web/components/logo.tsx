import { preload } from "react-dom";

// A shared mask keeps the drawing out of each page's markup and RSC payload.
// It paints currentColor, including in dark mode and on printed posters.
// Keep this full animal mark separate from the simplified browser-tab icon.
// The source must stay transparent: an opaque plate would mask as a rectangle.
const LOGO_HREF = "/logo.svg";

// inline-block, not block: with width auto a block box stretches to its
// container and aspect-ratio stops applying, so the mark would paint full
// width anywhere it is not a flex item. Both callers happen to be flex rows,
// which an <svg> never had to care about and this should not either.
const LOGO_STYLE = {
  display: "inline-block",
  aspectRatio: "128 / 120.8",
  backgroundColor: "currentColor",
  // Unprefixed mask-* landed in Chromium 120 and Next's default target is
  // Chrome 111, so the prefixed half is still load-bearing. React does not
  // autoprefix inline styles.
  mask: `url(${LOGO_HREF}) no-repeat center / contain`,
  WebkitMask: `url(${LOGO_HREF}) no-repeat center / contain`,
} as const;

export function Logo({ className }: { className?: string }) {
  // An unloaded mask does not mask, so without this the box paints as a solid
  // rectangle for a frame before the picture arrives. react-dom dedupes this
  // per document, so rendering Logo twice still emits one tag.
  //
  // crossOrigin is not optional here. CSS fetches a mask anonymously, and a
  // preload without it asks in a different credentials mode, so the browser
  // discards the preloaded copy and fetches the file a second time. Chrome says
  // so out loud: "a preload for /logo.svg is found, but is not used because the
  // request credentials mode does not match".
  //
  // fetchPriority is not decoration either, and it fixes two things with one
  // argument. An image preload defaults to Low, so the previous drawing queued
  // behind roughly 600KB of JavaScript; and react-dom routes an image preload
  // into the head's early queue only when it is marked high, so in the export
  // the tag landed last in the head, after both stylesheets and every async
  // script. Until the file arrives the box above paints currentColor with
  // nothing masking it, which in the header is a near-black rectangle: the
  // exact frame this preload exists to prevent.
  preload(LOGO_HREF, {
    as: "image",
    crossOrigin: "anonymous",
    fetchPriority: "high",
  });
  return <span aria-hidden data-logo-mark className={className} style={LOGO_STYLE} />;
}
