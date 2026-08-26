import type { Metadata } from "next";
import { FoundAnimalPage } from "@/components/found-animal-page";

// The description answers the searches this page exists for ("našel sem psa",
// "kdo pobere zapuščeno žival") with the three facts that matter before the
// visitor even lands: there is a responsible shelter, it is found by občina,
// and the finder pays nothing. It is also what a link pasted into a Facebook
// group shows under the title, where the homepage's card used to advertise
// adoption under a post about a stray.
export const metadata: Metadata = {
  title: "Si našel žival? | Posvoji.si",
  description:
    "Vpiši občino ali poštno številko kraja, kjer si našel žival, in dobiš pristojno zavetišče s telefonsko številko. Odlov in oskrbo krije občina – najditelja ne stane nič.",
};

export default function NajdenaZival() {
  return <FoundAnimalPage locale="sl" />;
}
