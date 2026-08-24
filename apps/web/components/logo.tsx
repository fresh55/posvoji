import { preload } from "react-dom";

// The mark is a traced line-art drawing: one even-odd path of about 11KB.
// Inlined as an <svg> it was 22KB of every page that carries a header, because
// the header renders inside I18nProvider and so the path landed once in the
// markup and again in the RSC flight payload. Across the export that was 23MB
// for one logo, and on an animal page it was over a third of the compressed
// weight.
//
// So it is pulled in as a mask instead: the element paints currentColor through
// the picture, which keeps the contract the inline version had, that the logo
// is a single colour and follows whatever text colour surrounds it, dark mode
// included. One cached request now serves every page.
//
// The file is app/icon.svg, the same drawing the favicon already ships, rather
// than a second copy under public/. A mask reads only alpha, so the fills and
// the prefers-color-scheme block in there do not reach this. That does make the
// header depend on the icon's silhouette: app/icon.svg says so.
const LOGO_HREF = "/icon.svg";

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
  // so out loud: "a preload for /icon.svg is found, but is not used because the
  // request credentials mode does not match".
  preload(LOGO_HREF, { as: "image", crossOrigin: "anonymous" });
  return <span aria-hidden className={className} style={LOGO_STYLE} />;
}
