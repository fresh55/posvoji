"use client";

import { Check, LoaderCircle } from "lucide-react";
import { m, useReducedMotion } from "motion/react";
import { portalText } from "@/components/portal/portal-text";
import type { PortalSaveState } from "@/hooks/portal-list";

/**
 * One quiet place for the outcome of a save.
 *
 * Both cards and both editor pages draw it, so a status tap on the list and a
 * save made on an animal's own page report themselves the same way. Each state
 * mounts and fades in on its own; nothing animates on the way out, so a
 * stalled exit can never leave a stale label behind.
 *
 * A failure is not drawn here. It has a sentence of its own, next to whatever
 * the shelter would try again.
 */
export function SaveStatusPip({ state }: { state: PortalSaveState }) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <div aria-live="polite" className="min-h-6 shrink-0">
      {state.status === "saving" && (
        <m.span
          key="saving"
          initial={shouldReduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.15, ease: "easeOut" }}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground"
        >
          <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
          {portalText.saving}
        </m.span>
      )}
      {state.status === "saved" && (
        <m.span
          key="saved"
          initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          className="inline-flex items-center gap-1 rounded-4xl border border-[var(--filter-accent-border)] bg-[var(--filter-accent)] px-1.5 py-0.5 text-2xs font-medium text-[var(--filter-accent-foreground)]"
        >
          <Check className="size-3" strokeWidth={2.6} aria-hidden />
          {portalText.saved}
        </m.span>
      )}
    </div>
  );
}
