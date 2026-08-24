import type { CSSProperties } from "react";
import type { Metadata, Viewport } from "next";
import { fontStack } from "@/app/font-stack";
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
    <html lang="sl" className="h-full antialiased"
      style={{ "--font-sans": fontStack } as CSSProperties}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
