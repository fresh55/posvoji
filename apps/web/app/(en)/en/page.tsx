import type { Metadata } from "next";
import { JsonLd } from "@/components/json-ld";
import { SitePage } from "@/components/site-page";
import { withFeedLinks } from "@/lib/feeds";
import { getMessages } from "@/lib/i18n";
import { HOME_PATHS } from "@/lib/shelter-path";
import { siteJsonLd } from "@/lib/shelter-jsonld";
import { staticPageMetadata } from "@/lib/site-metadata";

// The Slovenian half of the pair. See the note on the / route, the full stop
// on the hero sentence and the feed links included.
export const metadata: Metadata = withFeedLinks(
  staticPageMetadata({
    locale: "en",
    paths: HOME_PATHS,
    title: getMessages("en").heroTitle.replace(/\.$/, ""),
    description: getMessages("en").metadataDescription,
    // Beside the root layout, the same as the / route. See staticPageMetadata.
    besideTheRootLayout: true,
  }),
  "en",
);

export default function Home() {
  return (
    <>
      <JsonLd data={siteJsonLd("en")} />
      <SitePage locale="en" />
    </>
  );
}
