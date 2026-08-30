"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { getMessages, type Locale } from "@/lib/i18n";
import { homePath } from "@/lib/shelter-path";

/**
 * The body of both locales' error boundaries.
 *
 * An error boundary has to be a client component, and it wraps the pages under
 * a root layout without wrapping the layout itself, which is a Next constraint
 * rather than a choice: the header and footer around it are already gone by the
 * time this renders, so it stays a small standalone block instead of drawing
 * chrome it cannot place.
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
    <div className="mx-auto flex min-h-full w-full max-w-7xl flex-1 flex-col items-center justify-center gap-4 px-gutter py-page-y text-center">
      <h1 className="text-2xl font-medium tracking-tight">
        {messages.errorTitle}
      </h1>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button onClick={() => reset()}>{messages.tryAgain}</Button>
        <a
          href={homePath(locale)}
          className="max-lg:tap-target text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          {messages.backToAnimals}
        </a>
      </div>
    </div>
  );
}
