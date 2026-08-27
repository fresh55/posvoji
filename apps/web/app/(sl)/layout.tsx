import type { CSSProperties } from "react";
import type { Metadata, Viewport } from "next";
import { fontStack } from "@/app/font-stack";
import { PrehydrationFilterScript } from "@/components/prehydration-filter-script";
import { getMessages } from "@/lib/i18n";
import { SITE_URL } from "@/lib/site";
import "../globals.css";

export const metadata: Metadata = {
  // Link previews need absolute URLs, and a static export has no request to
  // build one from, so every relative URL below is resolved against this.
  metadataBase: new URL(SITE_URL),
  title: "Posvoji.si",
  description: getMessages("sl").metadataDescription,
};

// Without this, env(safe-area-inset-*) resolves to 0 on iOS: the page draws
// under the notch and home indicator, but nothing is told it may.
export const viewport: Viewport = { viewportFit: "cover" };

export default function SlovenianLayout({ children }: LayoutProps<"/">) {
  return (
    // No `antialiased` here on purpose. The class is
    // -webkit-font-smoothing: antialiased, which the create-next-app
    // template ships by default. It is a no-op on Windows and on macOS
    // it forces greyscale text, giving up subpixel antialiasing for the
    // whole site.
    //
    // suppressHydrationWarning for the script below, which writes an attribute
    // on this element before React ever sees it.
    <html lang="sl" className="h-full" suppressHydrationWarning
      style={{ "--font-sans": fontStack } as CSSProperties}>
      {/* html's h-full and this min-h-full together make the body at least a
          viewport tall, and the column is what PageShell's flex-1 grows
          inside. Both halves are load-bearing: drop either and a short page's
          footer floats in the middle of the viewport again. */}
      <body className="flex min-h-full flex-col">
        <PrehydrationFilterScript />
        {children}
      </body>
    </html>
  );
}
