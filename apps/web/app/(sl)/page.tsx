import type { Metadata } from "next";
import { SitePage } from "@/components/site-page";
import { getMessages } from "@/lib/i18n";
import { HOME_PATHS } from "@/lib/shelter-path";
import { staticPageMetadata } from "@/lib/site-metadata";

// The grid had nothing of its own in its head: the layout's bare "Posvoji.si",
// the same word in both languages, no canonical, no hreflang, no card. It is
// also the page every animal links back to as /?zival=<id>, a thousand
// addresses resolving to this one document, and until the canonical said so
// nothing told a crawler they were the same page.
//
// The title is the page's own H1, which is the sentence the site is for, and
// the description is the one the layout already wrote for the site as a whole.
export const metadata: Metadata = staticPageMetadata({
  locale: "sl",
  paths: HOME_PATHS,
  title: "Živali iz slovenskih zavetišč, ki iščejo dom",
  description: getMessages("sl").metadataDescription,
});

export default function Home() {
  return <SitePage locale="sl" />;
}
