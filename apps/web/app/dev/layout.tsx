import type { CSSProperties } from "react";
import type { Metadata, Viewport } from "next";
import { fontStack } from "@/app/font-stack";
import { getMessages } from "@/lib/i18n";
import "../globals.css";

// The /dev tree sits outside the (sl) and (en) locale groups, so it needs its
// own root layout to supply <html> and <body>. Kept minimal: nothing meant to
// ship, since the production build prunes the exported /dev tree. What it does
// carry, it carries for a reason, and each is noted below.

// Next requires one inert production parameter before the post-build prune, so
// its temporary render gets 404 metadata. The gallery only has a title on a
// dev machine.
export const metadata: Metadata = {
  title:
    process.env.NODE_ENV === "production"
      ? `${getMessages("sl").notFoundTitle} | Posvoji.si`
      : "Map states | Posvoji.si dev",
  robots: { index: false, follow: false },
};

// Matches the locale layouts, so safe-area-aware spacing behaves the same
// way under /dev as it does everywhere else.
export const viewport: Viewport = { viewportFit: "cover" };

export default function DevLayout({ children }: { children: React.ReactNode }) {
  return (
    // lang="sl" matches the product's default language. The gallery's own
    // headings are English, but they are dev furniture and never ship.
    //
    // `light` pins the tree to the light tokens. globals.css swaps to dark
    // under `@media (prefers-color-scheme: dark)` behind a `:root:not(.light)`
    // guard, and that guard is read on the root element and nowhere else, so
    // this is the only place the class does anything. The map gallery needs
    // it: its light section had nothing forcing a theme, so on a dark OS it
    // rendered in dark tokens beside a dark section that looked the same.
    // `.dark` is a plain token block and keeps working on the section itself.
    // The temporary production render is pruned, so only the dev gallery uses
    // this forced light root.
    //
    // The font stack is the site's rather than a plain next/font Inter, so the
    // č, š and ž in the gallery's shelter names are drawn by the same subset
    // face the real pages use and the gallery shows what the site draws.
    // See app/font-stack.ts.
    //
    // No `antialiased`, matching the locale layouts. See app/(sl)/layout.tsx.
    <html
      lang="sl"
      className="light h-full"
      style={{ "--font-sans": fontStack } as CSSProperties}
    >
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
