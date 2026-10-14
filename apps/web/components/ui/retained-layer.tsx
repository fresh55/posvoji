"use client";

import { Activity, useEffect, useState, type ReactNode } from "react";

/** Keep a visited panel's DOM, while cleaning up modal effects when hidden.
 * The exit remains visible for its existing CSS duration. Reopening cancels
 * that exit; Activity restores refs and effects, including entry focus.
 * Force-mounting a Radix portal alone would leave its scroll lock and
 * aria-hidden changes active while closed. */
export function RetainedLayer({ open, exitMs, children }: {
  open: boolean;
  exitMs: number;
  children: ReactNode;
}) {
  const [visited, setVisited] = useState(open);
  const [visible, setVisible] = useState(open);
  if (open && !visited) setVisited(true);
  if (open && !visible) setVisible(true);

  useEffect(() => {
    if (open || !visible) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(() => setVisible(false), reduced ? 0 : exitMs);
    return () => window.clearTimeout(timer);
  }, [open, visible, exitMs]);

  return visited ? (
    <Activity mode={open || visible ? "visible" : "hidden"}>{children}</Activity>
  ) : null;
}
