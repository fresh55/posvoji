import type { CSSProperties } from "react";
import type { Metadata, Viewport } from "next";
import { fontStack } from "@/app/font-stack";
import { NotFoundPage } from "@/components/not-found-page";
import { getMessages } from "@/lib/i18n";
import { SITE_URL } from "@/lib/site";
import "./globals.css";

// Handles a URL that matches no route anywhere in the app. (sl)/not-found.tsx
// and (en)/en/not-found.tsx only catch notFound() thrown by a page already
// inside their own root layout; a URL that never matched either locale's
// routes has no root layout to render in at all, since app/ has no layout of
// its own above the two locale ones. This file is that missing root: per
// Next's docs it must build its own <html>/<body> and import its own global
// styles, and because of that it cannot read the request path to pick a
// locale either. Slovenian, since that is the site's default, with the English
// sentence under it for the visitor who was reaching for the other half.
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: `${getMessages("sl").notFoundTitle} | Posvoji.si`,
  description: getMessages("sl").notFoundBody,
};

// Without this, env(safe-area-inset-*) resolves to 0 on iOS: the page draws
// under the notch and home indicator, but nothing is told it may. This file
// is a root of its own, so it needs the export the layouts carry; it does not
// inherit theirs.
export const viewport: Viewport = { viewportFit: "cover" };

export default function GlobalNotFound() {
  const en = getMessages("en");

  return (
    <html
      lang="sl"
      className="h-full"
      style={{ "--font-sans": fontStack } as CSSProperties}
    >
      <body className="flex min-h-full flex-col">
        <NotFoundPage locale="sl">
          <p className="text-sm text-muted-foreground" lang="en">
            {`${en.notFoundTitle}. ${en.notFoundBody}`}
          </p>
        </NotFoundPage>
      </body>
    </html>
  );
}
