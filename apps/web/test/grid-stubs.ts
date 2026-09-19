/**
 * The two seams an incrementally drawn grid needs in jsdom: an
 * IntersectionObserver to fire by hand, and a column count the grid can read
 * off its own element. Shared by the home grid's suite and the shelter grid's,
 * which draw through the same hook (use-incremental-grid.ts) and must be
 * measured the same way.
 *
 * Not a `.test.` file, so vitest does not collect it.
 */

// jsdom has no IntersectionObserver, which is the branch the grid falls back on
// by rendering everything. The chunking itself only exists where there is one,
// so the test that measures it brings its own and keeps the callbacks to fire
// by hand.
export type ObserverEntries = { isIntersecting: boolean }[];

// The callbacks to fire by hand, and every registration the grid made against
// them. The registrations matter as much as the callbacks: a step has to
// re-arm its observation, and re-arming is the observe call.
export type ObserverStub = {
  /** The live observers, in the order they were made. */
  callbacks: ((entries: ObserverEntries) => void)[];
  calls: { method: "observe" | "unobserve"; node: Element }[];
};

export function stubIntersectionObserver(): ObserverStub {
  const callbacks: ObserverStub["callbacks"] = [];
  const calls: ObserverStub["calls"] = [];
  Object.defineProperty(window, "IntersectionObserver", {
    configurable: true,
    writable: true,
    value: class {
      callback: (entries: ObserverEntries) => void;
      constructor(callback: (entries: ObserverEntries) => void) {
        this.callback = callback;
        callbacks.push(callback);
      }
      observe(node: Element) {
        calls.push({ method: "observe", node });
      }
      unobserve(node: Element) {
        calls.push({ method: "unobserve", node });
      }
      // A disconnected observer is done, and the list has to say so. The grid
      // makes a new one whenever the sorted list changes identity and React
      // hands the sentinel's ref callback over, which takes the old observer
      // down with it (watchSentinel's cleanup). Left in the list, that dead
      // observer still answered a hand-fired entry, and its step wrote the
      // count against the list it had closed over, which the next render then
      // read as a count for another list and threw away. A grid that was
      // stepping fine froze on one step's worth of cards, in the test alone.
      disconnect() {
        const at = callbacks.indexOf(this.callback);
        if (at !== -1) callbacks.splice(at, 1);
      }
    },
  });
  return { callbacks, calls };
}

// The step is measured off the rendered grid's own column count, and jsdom
// lays nothing out, so the columns are stubbed instead of laid out. Only the
// card grid's element answers differently: the rest of the tree reads computed
// style too, and gets jsdom's real answer.
//
// Found by its data attribute and not by its classes, for the reason the grid
// marks itself with one: a class list is layout, and layout is free to gain a
// class. Matched on the class list, one call to cn() around CARD_GRID would
// have left this patching nothing, and every column count here quietly
// charging the two-column fallback instead.
const realComputedStyle = window.getComputedStyle.bind(window);

export function stubGridColumns(tracks: string) {
  window.getComputedStyle = (element: Element, pseudo?: string | null) => {
    const style = realComputedStyle(element, pseudo ?? undefined);
    if (
      element instanceof HTMLElement &&
      element.hasAttribute("data-card-grid")
    ) {
      Object.defineProperty(style, "gridTemplateColumns", {
        configurable: true,
        value: tracks,
      });
    }
    return style;
  };
}

export function columnTracks(columns: number) {
  return Array.from({ length: columns }, () => "245px").join(" ");
}

/** Puts jsdom's own getComputedStyle back; call it from afterEach. */
export function restoreGridColumns() {
  window.getComputedStyle = realComputedStyle;
}

/**
 * The idle callback jsdom does not ship, as a task.
 *
 * The grid waits for an idle moment to mount the dialog and the fan waits for
 * one before it warms the tier a step would bring in. Without this both fall
 * back to their timeouts, and the grid's is two seconds: the suite that misses
 * it sits out the fallback instead of failing, which is the sort of slowness
 * nobody goes looking for. A task is the nearest thing this environment has to
 * idle and it puts the tests on the path a browser takes.
 *
 * Installed only where there is nothing there already, so a suite that drains
 * an idle queue of its own keeps it.
 */
export function stubIdleCallback() {
  window.requestIdleCallback ??= ((callback: IdleRequestCallback) =>
    window.setTimeout(
      () => callback({ didTimeout: false, timeRemaining: () => 50 }),
      0,
    )) as typeof window.requestIdleCallback;
  window.cancelIdleCallback ??= ((handle: number) =>
    window.clearTimeout(handle)) as typeof window.cancelIdleCallback;
}
