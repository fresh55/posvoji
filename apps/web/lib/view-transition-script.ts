// A cross-document transition's outgoing ready promise rejects when the old
// document is hidden. This is normal cancellation, not a failed navigation.
// Attach before the first paint (pagereveal can run before hydration).
// Only handle this transition's promise; unrelated rejections remain visible.
export const VIEW_TRANSITION_SCRIPT = `(()=>{
  function observe(event) {
    if (!event.viewTransition) return;
    event.viewTransition.ready.catch(error => {
      if (error?.name !== "AbortError") console.error(error);
    });
  }
  window.addEventListener("pageswap", observe);
  window.addEventListener("pagereveal", observe);
})();`;
