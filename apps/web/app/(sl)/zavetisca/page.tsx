import type { Metadata } from "next";
import { SheltersPage } from "@/components/shelters-page";

export const metadata: Metadata = {
  title: "Zavetišča | Posvoji.si",
  description:
    "Seznam slovenskih zavetišč za živali: za katera je na voljo strukturiran seznam živali in kje najdete kontaktne podatke za ostala.",
};

export default function Zavetisca() {
  return <SheltersPage locale="sl" />;
}
