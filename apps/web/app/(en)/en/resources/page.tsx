import type { Metadata } from "next";
import { ResourcesPage } from "@/components/resources-page";
import { RESOURCES_PATHS } from "@/lib/site-links";
import { staticPageMetadata } from "@/lib/site-metadata";

export const metadata: Metadata = staticPageMetadata({
  locale: "en",
  paths: RESOURCES_PATHS,
  title: "Trusted animal-care resources",
  description:
    "Trusted veterinary resources about nutrition, health, behaviour and welfare for dogs, cats, rabbits and other companion animals.",
});

export default function Resources() {
  return <ResourcesPage locale="en" />;
}
