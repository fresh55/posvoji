import type { CSSProperties } from "react";
import type { Metadata, Viewport } from "next";
import { fontStack } from "@/app/font-stack";
import { PrehydrationFilterScript } from "@/components/prehydration-filter-script";
import { getMessages } from "@/lib/i18n";
import { SITE_URL } from "@/lib/site";
import "../../globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Posvoji.si",
  description: getMessages("en").metadataDescription,
};

// Without this, env(safe-area-inset-*) resolves to 0 on iOS: the page draws
// under the notch and home indicator, but nothing is told it may.
export const viewport: Viewport = { viewportFit: "cover" };

export default function EnglishLayout({ children }: LayoutProps<"/en">) {
  return (
    // No `antialiased` here, mirroring the Slovenian layout: the class is
    // -webkit-font-smoothing: antialiased, a no-op on Windows and greyscale
    // text on macOS.
    //
    // suppressHydrationWarning for the script below, which writes an attribute
    // on this element before React ever sees it.
    <html lang="en" className="h-full" suppressHydrationWarning
      style={{ "--font-sans": fontStack } as CSSProperties}>
      <body className="flex min-h-full flex-col">
        <PrehydrationFilterScript />
        {children}
      </body>
    </html>
  );
}
