/** The print at the front of this stage, or null while there is no stage.
 *
 *  The chevrons and the count live on the stage too, and neither of them is a
 *  print: data-print is what only a print carries, and aria-current is what
 *  the one in front carries with it. Four callers ask this question: focus on
 *  the way in, the rectangle the contact sheet grows out of, focus on the way
 *  back from the lightbox, and the dialog around all three, which opens on the
 *  front print and has no other way to name it. */
export function frontPrintOf(stage: HTMLElement | null) {
  return (
    stage?.querySelector<HTMLElement>(
      'button[data-print][aria-current="true"]',
    ) ?? null
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

/** Whether this is a print the keyboard can still be left on.
 *
 *  A print the fan has taken off the stage is in the document until its fade
 *  is over, and it is no use to anyone there: it answers no key, it takes no
 *  press, and it is about to be removed, which would drop focus to the layer
 *  around it. Two callers ask it, the fan's own walk and the lightbox handing
 *  focus back, so the rule lives here with the rest of the contract. */
export function isStandingPrint(element: HTMLElement | null | undefined) {
  return Boolean(element?.isConnected && element.dataset.leaving !== "true");
}

/** The print the keyboard is standing on, or null while it is standing
 *  somewhere else.
 *
 *  Asked before a commit rather than after it, because a commit is what
 *  unmounts the print focus is on and by then the answer is gone. Any print
 *  and not just the front one, so data-print is what is read rather than
 *  aria-current: the first is on every print, the second names only the one
 *  standing in front.
 *
 *  Which visitor that focus belongs to is deliberately not answered here. The
 *  browser's own :focus-visible cannot say: the dialog opens on the front
 *  print, a press on an already focused print moves nothing, and Chromium then
 *  answers true for the rest of that focus, so every drag read as a keyboard
 *  user. The fan remembers who walked it instead. */
export function heldPrintOf(stage: HTMLElement | null): HTMLElement | null {
  const held = document.activeElement;
  if (
    !stage ||
    !(held instanceof HTMLElement) ||
    !stage.contains(held) ||
    !held.hasAttribute("data-print")
  ) {
    return null;
  }
  return held;
}
