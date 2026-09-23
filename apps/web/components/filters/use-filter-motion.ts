"use client";

import { useCallback, useEffect, useState } from "react";
import type { CSSProperties, FocusEvent, PointerEvent } from "react";

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

/**
 * What the slowest thing a card takes off needs once its turn comes. The
 * halo's fade is 0.15s and the glyphs' run 0.12s to 0.24s, so this covers the
 * longest of them with a frame to spare.
 */
const RESET_TAIL_MS = 300;

/**
 * How long the section holds the reset open.
 *
 * Derived from the section's own length rather than fixed. It was 280ms flat,
 * under a comment saying the last card had had its turn, and that was true
 * only up to about four cards: Barva draws ten swatches, whose last turn
 * comes at 405ms. A motion transition survives the miss, because its delay is
 * already scheduled and the target it animates to does not change when the
 * flag clears. A CSS transition-delay does not: rewriting it mid-wait starts
 * the transition there and then, which is the snap the stagger exists to
 * avoid. See resetDelayStyle.
 */
function resetHoldMs(cardCount: number): number {
  return Math.max(cardCount - 1, 0) * RESET_STAGGER * 1000 + RESET_TAIL_MS;
}

export function useResetStagger(
  selectedCount: number,
  /** How many cards the section draws, which sets when the last turn comes. */
  cardCount: number,
): {
  isResetting: boolean;
  beginReset: () => void;
  resetDelay: (index: number) => number;
} {
  const [isResetting, setIsResetting] = useState(false);
  const holdMs = resetHoldMs(cardCount);

  // The clock starts once the selection has actually emptied rather than when
  // the reset is asked for: the filters land through the parent, which can
  // take a render to answer, and a timer started before that would be
  // measuring the wrong thing.
  useEffect(() => {
    if (!isResetting || selectedCount > 0) return;
    const timer = window.setTimeout(() => setIsResetting(false), holdMs);
    return () => window.clearTimeout(timer);
  }, [isResetting, selectedCount, holdMs]);

  const beginReset = useCallback(() => setIsResetting(true), []);

  const resetDelay = useCallback(
    (index: number) => (isResetting ? index * RESET_STAGGER : 0),
    [isResetting],
  );

  return { isResetting, beginReset, resetDelay };
}

/**
 * The same turn-taking, for a glyph whose accent is a class rather than a
 * motion target.
 *
 * Družba, Zdravje and Velikost colour their icons with Tailwind and let a CSS
 * transition carry it, so there is no transition object to put the delay in,
 * and the icon went grey while its own halo was still lit.
 *
 * Nothing while the card is being switched on, because a CSS transition has
 * one rule for both directions: the delay belongs to the leaving half of the
 * gesture, and a card picked during another card's wink would otherwise sit
 * uncoloured waiting for a turn it is not taking.
 */
export function resetDelayStyle(
  checked: boolean,
  resetDelay: number,
): CSSProperties | undefined {
  if (checked || resetDelay === 0) return undefined;
  return { transitionDelay: `${resetDelay}s` };
}

type HoverHandlers = {
  onPointerEnter: (event: PointerEvent<Element>) => void;
  onPointerLeave: () => void;
  onFocus: (event: FocusEvent<Element>) => void;
  onBlur: () => void;
};

// A tap leaves focus on the button, so the lift is limited to a real mouse and
// to keyboard focus. Anything else would leave a card lit after a touch.
//
// settle(value) marks the card a press just landed on, until the pointer or
// focus leaves it. Most sections ignore it: a lift after a click is ordinary
// hover feedback. Barva reads it, because its hover draws the ear tips halfway
// to the picked pose, and a colour unpicked under the mouse that kept them up
// read as a pick that had not come off.
export function useFilterCardHover<T extends string = string>(): {
  hoveredValue: T | null;
  settledValue: T | null;
  settle: (value: T) => void;
  handlers: (value: T) => HoverHandlers;
} {
  const [hoveredValue, setHoveredValue] = useState<T | null>(null);
  const [settledValue, setSettledValue] = useState<T | null>(null);

  const handlers = useCallback((value: T): HoverHandlers => {
    const leave = () => {
      const drop = (current: T | null) => (current === value ? null : current);
      setHoveredValue(drop);
      setSettledValue(drop);
    };
    return {
      onPointerEnter: (event) => {
        if (event.pointerType !== "mouse") return;
        setHoveredValue(value);
      },
      onPointerLeave: leave,
      onFocus: (event) => {
        if (!event.currentTarget.matches(":focus-visible")) return;
        setHoveredValue(value);
      },
      onBlur: leave,
    };
  }, []);

  return { hoveredValue, settledValue, settle: setSettledValue, handlers };
}

type PressHandlers = {
  onPointerDown: () => void;
  onPointerUp: () => void;
  onPointerCancel: () => void;
  onPointerLeave: () => void;
};

/**
 * Which card a pointer is being held down on.
 *
 * Not exported. A press and a hover both answer onPointerLeave, so a caller
 * spreading the two sets onto one button silently drops whichever it spreads
 * first. Every section that wants a press wants a hover too, so the pair is
 * handed out already composed by useFilterCardGestures below and this stays
 * its private half.
 */
function useFilterCardPress<T extends string = string>(): {
  pressedValue: T | null;
  release: (value: T) => void;
  handlers: (value: T) => PressHandlers;
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
    (value: T): PressHandlers => ({
      onPointerDown: () => setPressedValue(value),
      onPointerUp: () => release(value),
      onPointerCancel: () => release(value),
      onPointerLeave: () => release(value),
    }),
    [release],
  );

  return { pressedValue, release, handlers };
}

export type FilterCardGestureHandlers = HoverHandlers & Partial<PressHandlers>;

/**
 * What the pointer is doing to a card, as one set of handlers.
 *
 * The state, the `current === value` release guard and the four pointer
 * handlers were written out in size-paw-cards, energy-cards, care-cards and
 * home-cards, character for character, comment included, and the coat glyph
 * made it five. Two things were being copied with them: that touch browsers
 * skip pointerleave when the finger slides off, so the click has to clear the
 * press as well, and that pointercancel does not cover every path either.
 *
 * The composition is the other half of why this exists. Hover and press both
 * answer onPointerLeave, so each of those five sites spread both sets and
 * then wrote the combined leave out again by hand underneath. A site that
 * forgot would leave a card lit after the mouse had gone, with nothing
 * failing. There is one leave handler here and the sites spread it.
 *
 * release stays on the hook rather than in the handlers because the click is
 * where it is needed, and the click is the caller's.
 */
export function useFilterCardGestures<T extends string = string>({
  /**
   * Off for a section whose icon does not answer a held pointer: registering
   * the handlers anyway puts a second render of the whole section behind
   * every tap on it, which is what the ten-tile colour palette measured.
   */
  press = true,
}: { press?: boolean } = {}): {
  hoveredValue: T | null;
  /** The card a click last landed on, until the pointer leaves it. */
  settledValue: T | null;
  settle: (value: T) => void;
  pressedValue: T | null;
  /** Clears the press if this value still owns it. Safe to call from onClick. */
  release: (value: T) => void;
  handlers: (value: T) => FilterCardGestureHandlers;
} {
  const {
    hoveredValue,
    settledValue,
    settle,
    handlers: hoverHandlers,
  } = useFilterCardHover<T>();
  const {
    pressedValue,
    release,
    handlers: pressHandlers,
  } = useFilterCardPress<T>();

  const handlers = useCallback(
    (value: T): FilterCardGestureHandlers => {
      const hover = hoverHandlers(value);
      if (!press) return hover;
      const held = pressHandlers(value);
      return {
        ...hover,
        ...held,
        onPointerLeave: () => {
          hover.onPointerLeave();
          held.onPointerLeave();
        },
      };
    },
    [hoverHandlers, pressHandlers, press],
  );

  return { hoveredValue, settledValue, settle, pressedValue, release, handlers };
}
