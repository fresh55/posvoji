import type { Metadata } from "next";
import { SheltersPage } from "@/components/shelters-page";

export const metadata: Metadata = {
  title: "Shelters | Posvoji.si",
  description:
    "A list of Slovenian animal shelters: which ones have a structured animal list here, and where to find contact details for the rest.",
};

export default function Shelters() {
  return <SheltersPage locale="en" />;
}
