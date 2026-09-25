"use client";

import { useEffect, useState } from "react";

/**
 * False until a frame after mount.
 *
 * For a transition that must not run on the render that restores a shared
 * link's filters. The static export's server snapshot has none, so a
 * filtered link gains its real state a beat after the first paint, and a
 * plain mount effect cannot tell that render from a visitor's first pick.
 * `active` false skips the frame for an instance that never reads it.
 */
export function useAfterFirstFrame(active = true): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!active) return;
    const frame = window.requestAnimationFrame(() => setReady(true));
    return () => window.cancelAnimationFrame(frame);
  }, [active]);
  return ready;
}
