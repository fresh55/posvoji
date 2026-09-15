import type { Metadata } from "next";
import { ResourcesPage } from "@/components/resources-page";
import { getMessages } from "@/lib/i18n";
import { HIDDEN_LINK_KEYS, RESOURCES_PATHS } from "@/lib/site-links";
import { staticPageMetadata } from "@/lib/site-metadata";

export const metadata: Metadata = {
  ...staticPageMetadata({
    locale: "sl",
    paths: RESOURCES_PATHS,
    // The same string the roster and the h1 read, so the head cannot end up
    // naming the page something the page does not.
    title: getMessages("sl").resources,
    description:
      "Preverjeni veterinarski viri o prehrani, zdravju, vedenju in dobrobiti psov, mačk, kuncev in drugih hišnih živali.",
  }),
  // Unlisted in the site's own navigation and out of app/sitemap.ts with it,
  // so it says the same thing to a crawler that arrives anyway. The flag is
  // the roster's, the way /vstop states its own robots field in its route:
  // staticPageMetadata has none, and relisting the page clears this with it.
  // follow stays on. The page is a list of veterinary sources and the sources
  // are the part worth crawling; it is this page that should not be offered
  // as a result, not the pages it credits.
  ...(HIDDEN_LINK_KEYS.has("resources") && {
    robots: { index: false, follow: true },
  }),
};

export default function Resources() {
  return <ResourcesPage locale="sl" />;
}
