/**
 * The view transition the browser runs and jsdom has not got, stubbed once.
 *
 * Four suites hand-rolled the same settle-or-skip promise pair and ran the
 * update in place, and they had already drifted over what a skip does. What
 * each one really wants is its own answer sampled either side of the update, so
 * that is the one thing this takes.
 *
 * Run in place rather than on the browser's own schedule: what these suites are
 * about is the order of what happens around the update and who is allowed to
 * clean up afterwards, not when the browser gets round to any of it. Nothing
 * settles until the test says so, which is what the 320ms of a real morph looks
 * like from inside.
 *
 * Not a `.test.` file, so vitest does not collect it.
 */

import { PHOTO_MORPH_MARK } from "@/lib/photo-morph";

export type StartedTransition<T> = {
  /** What the sample said as the old state was captured. */
  before: T;
  /** And as the new one is: the browser takes it the moment the update
   *  returns. */
  after: T;
  /** The mark the stylesheet scopes the morph to, while the update ran. */
  mark: string | null;
  /** The update this transition was started with, already run. */
  update: () => void;
  /** The transition ending well, and the browser taking it away. */
  settle: () => void;
  skip: () => void;
};

/**
 * Installs the stub and hands back the list every transition is pushed onto, in
 * the order they were started. The caller puts `document.startViewTransition`
 * back itself, in the afterEach where the rest of its globals go.
 */
export function stubViewTransition<T = undefined>(
  sample: () => T = () => undefined as T,
): StartedTransition<T>[] {
  const started: StartedTransition<T>[] = [];
  document.startViewTransition = ((update: () => void) => {
    let settle = () => undefined as void;
    let skip = () => undefined as void;
    const finished = new Promise<void>((resolve, reject) => {
      settle = () => resolve();
      skip = () => reject(new Error("the browser skipped it"));
    });
    const before = sample();
    update();
    started.push({
      before,
      after: sample(),
      mark: document.documentElement.getAttribute(PHOTO_MORPH_MARK),
      update,
      settle,
      skip,
    });
    return { finished, ready: finished, updateCallbackDone: finished };
  }) as typeof document.startViewTransition;
  return started;
}
