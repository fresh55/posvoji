"use client";

import { useEffect } from "react";
import { I18nProvider } from "@/components/i18n-provider";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { getMessages, type Locale } from "@/lib/i18n";
import { HOME_PATHS, homePath } from "@/lib/shelter-path";

/**
 * The body of both locales' error boundaries.
 *
 * An error boundary has to be a client component, and it replaces the page it
 * guards: whatever the page rendered is gone and whatever a layout above it
 * rendered survives. On this site the chrome is page-level (there is no
 * route-group layout), so an error used to take the header and the footer with
 * it and leave a centred block with no landmarks at all. It draws its own
 * chrome instead, the way not-found-page.tsx does. Nothing in either component
 * is server-only, so a client boundary can render both.
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
    <I18nProvider locale={locale}>
      {/* The same shell as every other page, spelled out here for the same
          reason not-found-page.tsx spells it out: there is no layout to
          inherit it from. The frame carries the width, the gutter and the
          full-height column, so the block below only has to centre itself in
          what is left. */}
      <div className="mx-auto flex min-h-dvh w-full max-w-7xl flex-col px-gutter">
        {/* HOME_PATHS, as on the 404: an error has no address of its own to
            offer the other language. */}
        <SiteHeader locale={locale} languagePaths={HOME_PATHS} />

        <main
          id="vsebina"
          tabIndex={-1}
          className="flex flex-1 flex-col items-center justify-center gap-4 py-page-y text-center"
        >
          <h1 className="text-2xl font-medium tracking-tight">
            {messages.errorTitle}
          </h1>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button onClick={() => reset()}>{messages.tryAgain}</Button>
            {/* allAnimals, the one name the site has for its root. See the
                same row on not-found-page.tsx. */}
            <a
              href={homePath(locale)}
              className="max-lg:tap-target text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              {messages.allAnimals}
            </a>
          </div>
        </main>

        <SiteFooter locale={locale} />
      </div>
    </I18nProvider>
  );
}
