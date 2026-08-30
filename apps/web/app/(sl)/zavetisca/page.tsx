import type { Metadata } from "next";
import { SheltersPage } from "@/components/shelters-page";

export const metadata: Metadata = {
  title: "Zavetišča | Posvoji.si",
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
