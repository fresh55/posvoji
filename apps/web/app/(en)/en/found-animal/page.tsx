import type { Metadata } from "next";
import { FoundAnimalPage } from "@/components/found-animal-page";
import { FOUND_ANIMAL_PATHS } from "@/lib/found-animal";
import { getMessages } from "@/lib/i18n";
import { staticPageMetadata } from "@/lib/site-metadata";

export const metadata: Metadata = staticPageMetadata({
  locale: "en",
  paths: FOUND_ANIMAL_PATHS,
  // The Slovenian half of the pair. See the note on the /najdena-zival route.
  title: getMessages("en").muniPromptTitle,
  description:
    "Enter the municipality or postcode where you found the animal to get the responsible shelter and its phone number. The municipality covers capture and care – it costs the finder nothing.",
});

export default function FoundAnimal() {
  return <FoundAnimalPage locale="en" />;
}
