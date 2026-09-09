import type { CSSProperties } from "react";
import type { Metadata, Viewport } from "next";
import { fontStack } from "@/app/font-stack";
import { PrehydrationFilterScript } from "@/components/prehydration-filter-script";
import { rootMetadata, rootViewport } from "@/lib/site-metadata";
import "../../globals.css";

// The same head the Slovenian root carries, built in one place because there
// is no layout above the two of them. See lib/site-metadata.ts.
export const metadata: Metadata = rootMetadata("en");

export const viewport: Viewport = rootViewport;

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
      <body className="flex min-h-dvh flex-col">
        <PrehydrationFilterScript />
        {children}
      </body>
    </html>
  );
}
