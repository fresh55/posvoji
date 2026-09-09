import type { Metadata } from "next";
import { ResourcesPage } from "@/components/resources-page";
import { getMessages } from "@/lib/i18n";
import { RESOURCES_PATHS } from "@/lib/site-links";
import { staticPageMetadata } from "@/lib/site-metadata";

export const metadata: Metadata = staticPageMetadata({
  locale: "sl",
  paths: RESOURCES_PATHS,
  // The same string the roster and the h1 read, so the head cannot end up
  // naming the page something the page does not.
  title: getMessages("sl").resources,
  description:
    "Preverjeni veterinarski viri o prehrani, zdravju, vedenju in dobrobiti psov, mačk, kuncev in drugih hišnih živali.",
});

export default function Resources() {
  return <ResourcesPage locale="sl" />;
}
