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

/** Whose focus a walk is about to take the print out from under. */
export type FanFocusKind =
  /** A visitor who is working the fan with the keyboard, and to whom the ring
   *  on the new front print is the answer to what they just pressed. */
  | "keyboard"
  /** A finger or a mouse, which focused the print by pressing it. Putting the
   *  keyboard back on the new front print draws that focus as a ring, because
   *  a script focus in a document nobody has clicked in is the kind the
   *  browser shows. */
  | "pointer";

/** What is holding the keyboard on this stage, and which of the two it is.
 *
 *  Asked before a commit rather than after it, because a commit is what
 *  unmounts the print focus is on and by then the answer is gone. Any print
 *  and not just the front one, so the attribute is read rather than its value;
 *  see frontPrintOf for why aria-pressed is the thing to read. */
export function focusHeldOn(
  stage: HTMLElement | null,
): { print: HTMLElement; kind: FanFocusKind } | null {
  const held = document.activeElement;
  if (
    !stage ||
    !(held instanceof HTMLElement) ||
    !stage.contains(held) ||
    !held.hasAttribute("aria-pressed")
  ) {
    return null;
  }
  return { print: held, kind: isFocusVisible(held) ? "keyboard" : "pointer" };
}
