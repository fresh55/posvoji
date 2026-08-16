import type { Metadata } from "next";
import { ResourcesPage } from "@/components/resources-page";

export const metadata: Metadata = {
  title: "Trusted animal-care resources | Posvoji.si",
  description:
    "Trusted veterinary resources about nutrition, health, behaviour and welfare for dogs, cats, rabbits and other companion animals.",
};

export default function Resources() {
  return <ResourcesPage locale="en" />;
}
