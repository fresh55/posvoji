"use client";

import { useEffect, useState } from "react";

import { useI18n } from "@/components/i18n-context";

// How long a pending note waits before it draws. A fetch on a warm connection
// lands well inside this, and a box that appears and vanishes in that time is
// a flicker over whatever it sits on; being a live region, it is also an
// announcement nobody has time to read. A failure has no such window, so it
// draws at once.
const PENDING_DELAY_MS = 400;

export function DeferredStatus({
  error,
  retry,
}: {
  error?: boolean;
  retry: () => void;
}) {
  const { locale } = useI18n();
  const [waited, setWaited] = useState(false);
  useEffect(() => {
    if (error) return;
    const timer = window.setTimeout(() => setWaited(true), PENDING_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [error]);
  if (!error && !waited) return null;
  return (
    <span
      role="status"
      className="block rounded-ui bg-background p-2 text-sm text-foreground"
    >
      {error ? (
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
