import type { Metadata } from "next";
import { SitePage } from "@/components/site-page";
import { getMessages } from "@/lib/i18n";
import { homePath } from "@/lib/shelter-path";
import { staticPageMetadata } from "@/lib/site-metadata";

// The Slovenian half of the pair. See the note on the / route.
export const metadata: Metadata = staticPageMetadata({
  locale: "en",
  paths: { sl: homePath("sl"), en: homePath("en") },
  title: "Animals from Slovenian shelters looking for a home",
  description: getMessages("en").metadataDescription,
});

export default function Home() {
  return <SitePage locale="en" />;
}
