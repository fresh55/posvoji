import type { Metadata } from "next";
import { PortalWorkspace } from "@/components/portal/portal-workspace";

export const metadata: Metadata = {
  title: "Portal za zavetišča | Posvoji.si",
  description:
    "Zavetišča tukaj urejajo svoje živali na Posvoji.si: stanje, ime, opis in ostale podatke.",
  robots: { index: false, follow: false },
};

export default function Portal() {
  return <PortalWorkspace />;
}
