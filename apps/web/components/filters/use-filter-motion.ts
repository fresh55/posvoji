"use client";

import { useCallback, useEffect, useState } from "react";
import type { FocusEvent, PointerEvent } from "react";

export type Celebration<T> = { value: T; id: number };

// One-shot celebrations are held as {value, id} so repeating the same choice
// still restarts the gesture: the id changes even when the value does not.
// holdMs is sized to the longest variant the caller can run, because the tail
// of a gesture snaps back to rest the moment the state clears.
export function useOneShotCelebration<T>(holdMs: number): {
  celebration: Celebration<T> | null;
  celebrate: (value: T) => void;
  clear: () => void;
} {
  const [celebration, setCelebration] = useState<Celebration<T> | null>(null);

  useEffect(() => {
    if (!celebration) return;
    const timer = window.setTimeout(() => setCelebration(null), holdMs);
    return () => window.clearTimeout(timer);
  }, [celebration, holdMs]);

  const celebrate = useCallback((value: T) => {
    setCelebration((current) => ({ value, id: (current?.id ?? 0) + 1 }));
  }, []);

  const clear = useCallback(() => setCelebration(null), []);

  return { celebration, celebrate, clear };
}

// A reset winks the section's cards out in order rather than all at once, so
// the delay a card takes is its position in the section.
export const RESET_STAGGER = 0.045;
// Long enough for the last card in a section to have had its turn.
const RESET_CLEAR_MS = 280;

export function useResetStagger(selectedCount: number): {
  isResetting: boolean;
  beginReset: () => void;
  resetDelay: (index: number) => number;
} {
  const [isResetting, setIsResetting] = useState(false);

  useEffect(() => {
    if (!isResetting || selectedCount > 0) return;
    const timer = window.setTimeout(
      () => setIsResetting(false),
      RESET_CLEAR_MS,
    );
    return () => window.clearTimeout(timer);
  }, [isResetting, selectedCount]);

  const beginReset = useCallback(() => setIsResetting(true), []);

  const resetDelay = useCallback(
    (index: number) => (isResetting ? index * RESET_STAGGER : 0),
    [isResetting],
  );

  return { isResetting, beginReset, resetDelay };
}

/**
 * Which card a pointer is being held down on, and the handlers that keep that
 * honest.
 *
 * The state, the `current === value` release guard and the four pointer
 * handlers were written out in size-paw-cards, energy-cards, care-cards and
 * home-cards before this, character for character, comment included. The coat
 * glyph made it five, which is where it stops: the knowledge that touch
 * browsers skip pointerleave when the finger slides off, and that
 * pointercancel does not cover every path, should live in one place rather
 * than in five copies of the same paragraph.
 *
 * The other four still spell it out. They can adopt this as they are next
 * touched; nothing here changes their behaviour.
 */
export function useFilterCardPress<T extends string = string>(): {
  pressedValue: T | null;
  /** Clears the press if this value still owns it. Safe to call from onClick. */
  release: (value: T) => void;
  handlers: (value: T) => {
    onPointerDown: () => void;
    onPointerUp: () => void;
    onPointerCancel: () => void;
    onPointerLeave: () => void;
  };
} {
  const [pressedValue, setPressedValue] = useState<T | null>(null);

  // Functional, and guarded on the value: a leave arriving late from the card
  // the pointer came from must not clear the press on the card it landed on.
  const release = useCallback(
    (value: T) =>
      setPressedValue((current) => (current === value ? null : current)),
    [],
  );

  const handlers = useCallback(
    (value: T) => ({
      onPointerDown: () => setPressedValue(value),
      onPointerUp: () => release(value),
      onPointerCancel: () => release(value),
      onPointerLeave: () => release(value),
    }),
    [release],
  );

  return { pressedValue, release, handlers };
}

type HoverHandlers = {
  onPointerEnter: (event: PointerEvent<Element>) => void;
  onPointerLeave: () => void;
  onFocus: (event: FocusEvent<Element>) => void;
  onBlur: () => void;
};

// A tap leaves focus on the button, so the lift is limited to a real mouse and
// to keyboard focus. Anything else would leave a card lit after a touch.
export function useFilterCardHover(): {
  hoveredValue: string | null;
  handlers: (value: string) => HoverHandlers;
} {
  const [hoveredValue, setHoveredValue] = useState<string | null>(null);

  const handlers = useCallback(
    (value: string): HoverHandlers => ({
      onPointerEnter: (event) => {
        if (event.pointerType !== "mouse") return;
        setHoveredValue(value);
      },
      onPointerLeave: () =>
        setHoveredValue((current) => (current === value ? null : current)),
      onFocus: (event) => {
        if (!event.currentTarget.matches(":focus-visible")) return;
        setHoveredValue(value);
      },
      onBlur: () =>
        setHoveredValue((current) => (current === value ? null : current)),
    }),
    [],
  );

  return { hoveredValue, handlers };
}
