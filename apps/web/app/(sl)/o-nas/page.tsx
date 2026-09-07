import type { Metadata } from "next";
import { AboutPage } from "@/components/about-page";
import { getMessages } from "@/lib/i18n";
import { ABOUT_PATHS } from "@/lib/site-links";
import { staticPageMetadata } from "@/lib/site-metadata";

export const metadata: Metadata = staticPageMetadata({
  locale: "sl",
  paths: ABOUT_PATHS,
  // The same string the breadcrumb, the h1 and the footer link read, so the
  // head cannot end up naming the page something the page does not.
  title: getMessages("sl").about,
  description:
    "Kako deluje Posvoji.si: posvojitev pri zavetišču, aktualnost objav in brezplačno sodelovanje zavetišč. Vsebine objavljamo z dovoljenjem.",
});

export default function About() {
  return <AboutPage locale="sl" />;
}
