import type { Metadata } from "next";
import { PortalWorkspace } from "@/components/portal/portal-workspace";

export const metadata: Metadata = {
  // Bare: the root layout's title template appends the site name.
  title: "Portal za zavetišča",
  description:
    "Zavetišča tukaj urejajo svoje živali na Posvoji.si: stanje, ime, opis in ostale podatke.",
  robots: { index: false, follow: false },
};

export default function Portal() {
  return <PortalWorkspace />;
}
