import type { Metadata } from "next";
import { FoundAnimalPage } from "@/components/found-animal-page";
import { indexMetadata } from "@/lib/page-share";

// The description this carries answers the searches the page exists for
// ("našel sem psa", "kdo pobere zapuščeno žival") with the three facts that
// matter before the visitor even lands: there is a responsible shelter, it is
// found by občina, and the finder pays nothing. It lives in lib/page-share.ts
// with the other three index pages' copy, and with the canonical, the
// hreflang pair and the Open Graph block the page now also carries.
export const metadata: Metadata = indexMetadata("foundAnimal", "sl");

export default function NajdenaZival() {
  return <FoundAnimalPage locale="sl" />;
}
