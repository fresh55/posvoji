import type { Metadata } from "next";
import { ResourcesPage } from "@/components/resources-page";
import { getMessages } from "@/lib/i18n";
import { HIDDEN_LINK_KEYS, RESOURCES_PATHS } from "@/lib/site-links";
import { staticPageMetadata } from "@/lib/site-metadata";

export const metadata: Metadata = {
  ...staticPageMetadata({
    locale: "en",
    paths: RESOURCES_PATHS,
    // The Slovenian half of the pair. See the note on the /viri route.
    title: getMessages("en").resources,
    description:
      "Trusted veterinary resources about nutrition, health, behaviour and welfare for dogs, cats, rabbits and other companion animals.",
  }),
  // Hidden the same way and for the same reason. See the /viri route.
  ...(HIDDEN_LINK_KEYS.has("resources") && {
    robots: { index: false, follow: true },
  }),
};

export default function Resources() {
  return <ResourcesPage locale="en" />;
}
