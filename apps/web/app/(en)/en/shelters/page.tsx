import type { Metadata } from "next";
import { SheltersPage } from "@/components/shelters-page";
import { sheltersIndexPath } from "@/lib/shelter-path";
import { staticPageMetadata } from "@/lib/site-metadata";

export const metadata: Metadata = staticPageMetadata({
  locale: "en",
  // The Slovenian half of the pair. See the note on the /zavetisca route.
  paths: { sl: sheltersIndexPath("sl"), en: sheltersIndexPath("en") },
  title: "Shelters",
  // Written for the search that lands here, which is "shelter" and a town
  // name. See the Slovenian route for the reasoning; the two stay mirrors.
  description:
    "Slovenian animal shelters with their phone numbers, emails and websites in one place. Find a shelter by town, municipality or postcode.",
});

export default function Shelters() {
  return <SheltersPage locale="en" />;
}
