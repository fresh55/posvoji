/** The print at the front of this stage, or null while there is no stage.
 *
 *  The chevrons and the count live on the stage too, and neither of them is a
 *  print: aria-pressed is what only a print carries, and only the front print
 *  carries it true. Four callers ask this question: focus on the way in, the
 *  rectangle the contact sheet grows out of, focus on the way back from the
 *  lightbox, and the dialog around all three, which opens on the front print
 *  and has no other way to name it. */
export function frontPrintOf(stage: HTMLElement | null) {
  return (
    stage?.querySelector<HTMLElement>('button[aria-pressed="true"]') ?? null
  );
}

// Keyboard focus straightens a photo the same way a hover does, but only the
// kind of focus that is meant to be seen. jsdom does not implement the
// selector, and a photo that cannot answer the question simply does not lift.
export function isFocusVisible(element: Element) {
  try {
    return element.matches(":focus-visible");
  } catch {
    return false;
  }
}
