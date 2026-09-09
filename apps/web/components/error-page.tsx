"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { getMessages, type Locale } from "@/lib/i18n";
import { MUTED_LINK } from "@/lib/link-styles";
import { homePath } from "@/lib/shelter-path";
import { CONTENT_ID } from "@/lib/skip-link";

/**
 * The body of both locales' error boundaries.
 *
 * An error boundary has to be a client component, and it replaces the page it
 * guards: whatever the page rendered is gone and whatever a layout above it
 * rendered survives. On this site the chrome is page-level (there is no
 * route-group layout), so an error takes the header and the footer with it.
 *
 * It draws a landmark and a way home, and deliberately not the chrome. Drawing
 * the chrome is what a reader would want if this ever rendered, and it was
 * tried: importing SiteHeader and SiteFooter here put the whole public chrome,
 * measured at about 2.5 KB gzipped, into both route groups' client bundles, and
 * a client boundary's imports are in the script list of every document under
 * it. That is every page of the export, the 1,006 poster sheets included, which
 * draw no chrome at all and could never usefully render it. On a fully static
 * export an error boundary effectively never fires, so the trade was a
 * certain site-wide cost against an improvement almost nobody sees.
 *
 * What the boundary owed the reader was a landmark to land in and a way out of
 * the page, and both are here. If this ever needs the full chrome, the way to
 * pay for it is next/dynamic, so the chunk is fetched when the boundary renders
 * rather than linked into every document.
 */
export function ErrorPage({
  locale,
  error,
  reset,
}: {
  locale: Locale;
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const messages = getMessages(locale);

  return (
    // The same frame as every other page, spelled out here rather than drawn
    // from site-shell.tsx: there is no layout to inherit it from, and the
    // shell brings the header and the footer with it, which is the cost the
    // note above declines to pay.
    <div className="mx-auto flex min-h-dvh w-full max-w-7xl flex-col px-gutter">
      <main
        id={CONTENT_ID}
        tabIndex={-1}
        className="flex flex-1 flex-col items-center justify-center gap-4 py-page-y text-center"
      >
        <h1 className="text-2xl font-medium tracking-tight">
          {messages.errorTitle}
        </h1>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button onClick={() => reset()}>{messages.tryAgain}</Button>
          {/* allAnimals, the one name the site has for its root. See the same
              row on not-found-page.tsx. */}
          <a href={homePath(locale)} className={MUTED_LINK}>
            {messages.allAnimals}
          </a>
        </div>
      </main>
    </div>
  );
}
