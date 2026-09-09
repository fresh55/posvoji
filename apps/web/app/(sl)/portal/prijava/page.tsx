import type { Metadata } from "next";
import { PortalLogin } from "@/components/portal/portal-login";

export const metadata: Metadata = {
  // Bare, like every other title in the tree: the root layout appends the
  // site name.
  title: "Prijava za zavetišča",
  description:
    "Prijava v portal Posvoji.si za zavetišča. Prijavite se s povezavo, ki jo pošljemo na e-naslov zavetišča.",
  robots: { index: false, follow: false },
};

export default function PortalPrijava() {
  return <PortalLogin />;
}
