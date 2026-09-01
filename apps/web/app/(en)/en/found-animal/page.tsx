import type { Metadata } from "next";
import { FoundAnimalPage } from "@/components/found-animal-page";
import { FOUND_ANIMAL_PATHS } from "@/lib/found-animal";
import { staticPageMetadata } from "@/lib/site-metadata";

export const metadata: Metadata = staticPageMetadata({
  locale: "en",
  paths: FOUND_ANIMAL_PATHS,
  title: "Found an animal?",
  description:
    "Enter the municipality or postcode where you found the animal to get the responsible shelter and its phone number. The municipality covers capture and care – it costs the finder nothing.",
});

export default function FoundAnimal() {
  return <FoundAnimalPage locale="en" />;
}
