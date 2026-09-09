// A cross-document transition's ready promise can reject with AbortError or
// InvalidStateError when skipped (including when the document becomes hidden).
// Navigation still completes; only the optional snapshot animation is skipped.
// https://drafts.csswg.org/css-view-transitions-1/#page-visibility-change-steps
// Attach before the first paint (pagereveal can run before hydration).
// Only handle this transition's promise; unrelated rejections remain visible.
export const VIEW_TRANSITION_SCRIPT = `(()=>{
  function observe(event) {
    if (!event.viewTransition) return;
    event.viewTransition.ready.catch(error => {
      if (error?.name !== "AbortError" && error?.name !== "InvalidStateError") console.error(error);
    });
  }
  window.addEventListener("pageswap", observe);
  window.addEventListener("pagereveal", observe);
})();`;
