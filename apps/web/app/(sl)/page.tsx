import type { Metadata } from "next";
import { JsonLd } from "@/components/json-ld";
import { SitePage } from "@/components/site-page";
import { getMessages } from "@/lib/i18n";
import { HOME_PATHS } from "@/lib/shelter-path";
import { siteJsonLd } from "@/lib/shelter-jsonld";
import { staticPageMetadata } from "@/lib/site-metadata";

// The grid had nothing of its own in its head: the layout's bare "Posvoji.si",
// the same word in both languages, no canonical, no hreflang, no card. It is
// also the page every animal links back to as /?zival=<id>, a thousand
// addresses resolving to this one document, and until the canonical said so
// nothing told a crawler they were the same page.
//
// The title is the page's own H1, which is the sentence the site is for, and
// the description is the one the layout already wrote for the site as a whole.
// Both are read from the catalogue rather than typed again here, so the head
// and the page cannot end up saying different things. The full stop comes off:
// the catalogue writes the hero as a sentence, and a <title> is not one.
export const metadata: Metadata = staticPageMetadata({
  locale: "sl",
  paths: HOME_PATHS,
  title: getMessages("sl").heroTitle.replace(/\.$/, ""),
  description: getMessages("sl").metadataDescription,
  // This page sits beside the root layout, so the title template cannot reach
  // it. See staticPageMetadata.
  besideTheRootLayout: true,
});

export default function Home() {
  return (
    <>
      {/* The one page type on the site that published no structured data. The
          node says who publishes this register and in which language this
          copy of it is written; the shelter, animal and about pages already
          say what they are. */}
      <JsonLd data={siteJsonLd("sl")} />
      <SitePage locale="sl" />
    </>
  );
}
