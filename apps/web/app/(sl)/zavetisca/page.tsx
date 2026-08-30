import type { Metadata } from "next";
import { SheltersPage } from "@/components/shelters-page";
import { sheltersIndexAlternates } from "@/lib/shelter-share";

export const metadata: Metadata = {
  title: "Zavetišča | Posvoji.si",
  // This page and /en/shelters are one document in two languages. Every
  // shelter's own page has said so since it was written; the index they hang
  // off said nothing, in either direction.
  alternates: sheltersIndexAlternates("sl"),
  // Written for the search that lands here, which is "zavetišče" and a town
  // name. What the page can do for that person is give them the phone number
  // and let them find their own town; how the data is licensed is the
  // project's concern, not theirs.
  description:
    "Slovenska zavetišča za živali s telefoni, e-naslovi in spletnimi stranmi na enem mestu. Poišči zavetišče po kraju, občini ali poštni številki.",
};

export default function Zavetisca() {
  return <SheltersPage locale="sl" />;
}
