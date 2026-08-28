"use client";

import { useSyncExternalStore } from "react";
import { useI18n } from "@/components/i18n-provider";
import { MUTED_LINK } from "@/lib/link-styles";

// A shelter page is reached two ways: from the shelters index, and from a
// card in the grid, which is where most people come from. The link back named
// the index either way, so a visitor who had never seen that page was offered
// it as "back", and the filters they had built in the grid went with the
// click. Browser back already does the right thing; there was simply nothing
// on the page that said so.

/** The grid, in either language, with whatever filters were on it. */
function gridReferrer(): string | undefined {
  if (typeof document === "undefined") return undefined;
  const { referrer } = document;
  if (!referrer) return undefined;
  let url: URL;
  try {
    url = new URL(referrer, window.location.href);
  } catch {
    return undefined;
  }
  if (url.origin !== window.location.origin) return undefined;
  // Only the two grid roots. An animal's own page or another shelter is a
  // sideways step, not the list this page was opened from.
  if (url.pathname !== "/" && url.pathname !== "/en") return undefined;
  return `${url.pathname}${url.search}`;
}

// The referrer never changes once the page has loaded, so there is nothing to
// subscribe to; this exists only to satisfy useSyncExternalStore's contract.
function subscribeToNothing(): () => void {
  return () => {};
}

/** The static fallback: what the server, and a crawler, always see. */
function noGrid(): undefined {
  return undefined;
}

/**
 * The way back, named after wherever the visitor actually came from. Renders
 * the static fallback on the server and on the first client paint, so the
 * markup a crawler and a cold load see is the index link it always was.
 * useSyncExternalStore's server/client snapshot split does the same job an
 * effect-plus-setState used to: it defers reading document.referrer until
 * after hydration without ever rendering a value the server could not also
 * have produced.
 */
export function BackLink({
  href,
  label,
  className,
}: {
  /** Where to go when the visitor did not arrive from the grid. */
  href: string;
  label: string;
  className?: string;
}) {
  const { messages } = useI18n();
  const grid = useSyncExternalStore(subscribeToNothing, gridReferrer, noGrid);

  return (
    <a href={grid ?? href} className={className ?? MUTED_LINK}>
      ← {grid ? messages.backToAnimals : label}
    </a>
  );
}
