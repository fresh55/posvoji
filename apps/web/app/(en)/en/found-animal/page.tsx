import type { Metadata } from "next";
import { FoundAnimalPage } from "@/components/found-animal-page";
import { indexMetadata } from "@/lib/page-share";

export const metadata: Metadata = indexMetadata("foundAnimal", "en");

export default function FoundAnimal() {
  return <FoundAnimalPage locale="en" />;
}
