import type { Metadata } from "next";
import { SheltersPage } from "@/components/shelters-page";

export const metadata: Metadata = {
  title: "Shelters | Posvoji.si",
  // Written for the search that lands here, which is "shelter" and a town
  // name. See the Slovenian route for the reasoning; the two stay mirrors.
  description:
    "Slovenian animal shelters with their phone numbers, emails and websites in one place. Find a shelter by town, municipality or postcode.",
};

export default function Shelters() {
  return <SheltersPage locale="en" />;
}
