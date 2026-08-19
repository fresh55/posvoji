import type { Metadata } from "next";
import { SheltersPage } from "@/components/shelters-page";

export const metadata: Metadata = {
  title: "Zavetišča | Posvoji.si",
  description:
    "Seznam slovenskih zavetišč za živali: katera z nami delijo strukturiran seznam živali z dovoljenjem in kje najdete kontaktne podatke za ostala.",
};

export default function Zavetisca() {
  return <SheltersPage locale="sl" />;
}
