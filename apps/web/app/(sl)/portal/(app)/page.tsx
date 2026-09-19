import type { Metadata } from "next";
import { PortalPageTransition } from "@/components/portal/portal-transition";
import { PortalWorkspace } from "@/components/portal/portal-workspace";

export const metadata: Metadata = {
  // Bare: the root layout's title template appends the site name.
  title: "Portal za zavetišča",
  description:
    "Zavetišča tukaj urejajo svoje živali na Posvoji.si: stanje, ime, opis in ostale podatke.",
  robots: { index: false, follow: false },
};

// The wrapper sits here and not in the layout on purpose: the layout persists
// across a client navigation, and a page body that is never unmounted has no
// exit to animate. The other page of the pair carries the same wrapper, so
// the step between them is one crossfade and not two unrelated fades.
export default function Portal() {
  return (
    <PortalPageTransition>
      <PortalWorkspace />
    </PortalPageTransition>
  );
}
