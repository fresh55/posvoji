import type { Metadata } from "next";
import { SheltersPage } from "@/components/shelters-page";
import { sheltersIndexPath } from "@/lib/shelter-path";
import { staticPageMetadata } from "@/lib/site-metadata";

export const metadata: Metadata = staticPageMetadata({
  locale: "sl",
  // This page and /en/shelters are one document in two languages. Every
  // shelter's own page has said so since it was written; the index they hang
  // off said nothing, in either direction, and it is the pair most likely to
  // be searched for in the language the searcher is not using.
  paths: { sl: sheltersIndexPath("sl"), en: sheltersIndexPath("en") },
  title: "Zavetišča",
  // Written for the search that lands here, which is "zavetišče" and a town
  // name. What the page can do for that person is give them the phone number
  // and let them find their own town; how the data is licensed is the
  // project's concern, not theirs.
  description:
    "Slovenska zavetišča za živali s telefoni, e-naslovi in spletnimi stranmi na enem mestu. Poišči zavetišče po kraju, občini ali poštni številki.",
});

export default function Zavetisca() {
  return <SheltersPage locale="sl" />;
}
