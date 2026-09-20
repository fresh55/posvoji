"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n-context";

// How long a pending note waits before it draws. A fetch on a warm connection
// lands well inside this, and a box that appears and vanishes in that time is
// a flicker over whatever it sits on and, as a live region, an announcement
// nobody has time to read.
const PENDING_DELAY_MS = 400;

export function DeferredStatus({
  error,
  retry,
}: {
  error?: boolean;
  retry: () => void;
}) {
  const { locale } = useI18n();
  // Once drawn, the note stays drawn: a retry turns the error back into a
  // wait, and the visitor who just pressed the button must not watch it
  // vanish for the length of the delay.
  const [waited, setWaited] = useState(!!error);
  if (error && !waited) setWaited(true);
  useEffect(() => {
    if (error) return;
    const timer = window.setTimeout(() => setWaited(true), PENDING_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [error]);
  const shown = error || waited;
  // The live region is mounted from the start and only its text arrives
  // later, because a region inserted with its sentence already in it is the
  // case screen readers routinely skip.
  return (
    <span
      role="status"
      className={
        shown
          ? "block rounded-ui bg-background p-2 text-sm text-foreground"
          : undefined
      }
    >
      {!shown ? null : error ? (
        <button type="button" className="underline" onClick={retry}>
          {locale === "sl"
            ? "Nalaganje ni uspelo. Poskusi znova."
            : "Loading failed. Try again."}
        </button>
      ) : locale === "sl" ? (
        "Nalaganje …"
      ) : (
        "Loading …"
      )}
    </span>
  );
}
