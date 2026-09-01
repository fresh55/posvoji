import type { Metadata } from "next";
import { ResourcesPage } from "@/components/resources-page";
import { RESOURCES_PATHS } from "@/lib/site-links";
import { staticPageMetadata } from "@/lib/site-metadata";

export const metadata: Metadata = staticPageMetadata({
  locale: "sl",
  paths: RESOURCES_PATHS,
  title: "Strokovno preverjeni viri",
  description:
    "Preverjeni veterinarski viri o prehrani, zdravju, vedenju in dobrobiti psov, mačk, kuncev in drugih hišnih živali.",
});

export default function Resources() {
  return <ResourcesPage locale="sl" />;
}
