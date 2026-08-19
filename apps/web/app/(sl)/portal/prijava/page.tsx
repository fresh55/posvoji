import type { Metadata } from "next";
import { PortalLogin } from "@/components/portal/portal-login";

export const metadata: Metadata = {
  title: "Prijava za zavetišča | Posvoji.si",
  description:
    "Prijava v portal Posvoji.si za zavetišča. Prijavite se s povezavo, ki jo pošljemo na e-naslov zavetišča.",
  robots: { index: false, follow: false },
};

export default function PortalPrijava() {
  return <PortalLogin />;
}
