import type { Metadata } from "next";
import { SitePage } from "@/components/site-page";
import { getMessages } from "@/lib/i18n";
import { HOME_PATHS } from "@/lib/shelter-path";
import { staticPageMetadata } from "@/lib/site-metadata";

// The Slovenian half of the pair. See the note on the / route.
export const metadata: Metadata = staticPageMetadata({
  locale: "en",
  paths: HOME_PATHS,
  title: "Animals from Slovenian shelters looking for a home",
  description: getMessages("en").metadataDescription,
});

export default function Home() {
  return <SitePage locale="en" />;
}
