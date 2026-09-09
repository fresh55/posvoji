import type { CSSProperties } from "react";
import type { Metadata, Viewport } from "next";
import { fontStack } from "@/app/font-stack";
import { PrehydrationFilterScript } from "@/components/prehydration-filter-script";
import { ViewTransitionScript } from "@/components/view-transition-script";
import { rootMetadata, rootViewport } from "@/lib/site-metadata";
import "../globals.css";

// Both roots carry the same head, so it is built in one place. See
// lib/site-metadata.ts for what is in it and why.
export const metadata: Metadata = rootMetadata("sl");

export const viewport: Viewport = rootViewport;

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
      <head><ViewTransitionScript /></head>
      <body className="flex min-h-dvh flex-col">
        <PrehydrationFilterScript />
        {children}
      </body>
    </html>
  );
}
