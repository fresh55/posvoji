import type { Metadata } from "next";
import { FoundAnimalPage } from "@/components/found-animal-page";

export const metadata: Metadata = {
  title: "Found an animal? | Posvoji.si",
  description:
    "Enter the municipality or postcode where you found the animal to get the responsible shelter and its phone number. The municipality covers capture and care – it costs the finder nothing.",
};

export default function FoundAnimal() {
  return <FoundAnimalPage locale="en" />;
}
