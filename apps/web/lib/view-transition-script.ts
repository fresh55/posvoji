// A cross-document transition's ready promise can reject with AbortError or
// InvalidStateError when skipped (including when the document becomes hidden).
// Navigation still completes; only the optional snapshot animation is skipped.
// https://drafts.csswg.org/css-view-transitions-1/#page-visibility-change-steps
// Attach before the first paint (pagereveal can run before hydration).
// Only handle this transition's promise; unrelated rejections remain visible.
//
// pageswap also takes the photo-morph mark off the root. lib/view-transition.ts
// writes data-photo-morph for the length of the dialog's morph and clears it
// when that transition settles, and a link pressed during the 320ms close
// leaves the document before it has. The stylesheet scopes the header's
// view-transition-name and the page handover to an unmarked root
// (globals.css), so a marked old document would be captured without either
// while the new one has both. pageswap fires before the old snapshot is taken,
// which makes it the one place to put the mark right.
import { PHOTO_MORPH_MARK } from "@/lib/photo-morph";

export const VIEW_TRANSITION_SCRIPT = `(()=>{
  function observe(event) {
    if (!event.viewTransition) return;
    event.viewTransition.ready.catch(error => {
      if (error?.name !== "AbortError" && error?.name !== "InvalidStateError") console.error(error);
    });
  }
  window.addEventListener("pageswap", event => {
    document.documentElement.removeAttribute("${PHOTO_MORPH_MARK}");
    observe(event);
  });
  window.addEventListener("pagereveal", observe);
})();`;
