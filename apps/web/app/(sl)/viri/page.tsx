import type { Metadata } from "next";
import { ResourcesPage } from "@/components/resources-page";

export const metadata: Metadata = {
  title: "Strokovno preverjeni viri | Posvoji.si",
  description:
    "Preverjeni veterinarski viri o prehrani, zdravju, vedenju in dobrobiti psov, mačk, kuncev in drugih hišnih živali.",
};

export default function Resources() {
  return <ResourcesPage locale="sl" />;
}
