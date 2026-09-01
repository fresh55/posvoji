import type { CSSProperties } from "react";
import type { Viewport } from "next";
import { fontStack } from "@/app/font-stack";
import "../globals.css";

// The /dev tree sits outside the (sl) and (en) locale groups, so it needs its
// own root layout to supply <html> and <body>. Kept minimal: nothing meant to
// ship, since the pages under here 404 in production. What it does carry, it
// carries for a reason, and each is noted below. No title: which of its two
// faces the route is wearing is map/page.tsx's own branch to make, so the
// title is stated there beside it.

// Matches the locale layouts, so safe-area-aware spacing behaves the same
// way under /dev as it does everywhere else.
export const viewport: Viewport = { viewportFit: "cover" };

export default function DevLayout({ children }: { children: React.ReactNode }) {
  return (
    // lang="sl", because what this tree actually serves in production is the
    // Slovenian 404 that map/page.tsx renders. The gallery's own headings are
    // English, but they are dev furniture and never leave a dev machine.
    //
    // `light` pins the tree to the light tokens. globals.css swaps to dark
    // under `@media (prefers-color-scheme: dark)` behind a `:root:not(.light)`
    // guard, and that guard is read on the root element and nowhere else, so
    // this is the only place the class does anything. The map gallery needs
    // it: its light section had nothing forcing a theme, so on a dark OS it
    // rendered in dark tokens beside a dark section that looked the same.
    // `.dark` is a plain token block and keeps working on the section itself.
    // The cost is that the 404 served from here is light on a dark OS, unlike
    // the site's own. A dev route's 404 is the cheaper of the two to give up.
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
