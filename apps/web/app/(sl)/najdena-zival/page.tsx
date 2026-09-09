import type { Metadata } from "next";
import { FoundAnimalPage } from "@/components/found-animal-page";
import { FOUND_ANIMAL_PATHS } from "@/lib/found-animal";
import { getMessages } from "@/lib/i18n";
import { staticPageMetadata } from "@/lib/site-metadata";

// The description answers the searches this page exists for ("našel sem psa",
// "kdo pobere zapuščeno žival") with the three facts that matter before the
// visitor even lands: there is a responsible shelter, it is found by občina,
// and the finder pays nothing. It is also what a link pasted into a Facebook
// group shows under the title, where the homepage's card used to advertise
// adoption under a post about a stray.
export const metadata: Metadata = staticPageMetadata({
  locale: "sl",
  paths: FOUND_ANIMAL_PATHS,
  // The page's own h1, read from the catalogue rather than typed again here.
  // It is the question the visitor typed into a search box, which is why it
  // differs from the noun the nav row carries.
  title: getMessages("sl").muniPromptTitle,
  description:
    "Vpiši občino ali poštno številko kraja, kjer si našel žival, in dobiš pristojno zavetišče s telefonsko številko. Odlov in oskrbo krije občina – najditelja ne stane nič.",
});

export default function NajdenaZival() {
  return <FoundAnimalPage locale="sl" />;
}
