import type { Metadata } from "next";
import { AboutPage } from "@/components/about-page";
import { getMessages } from "@/lib/i18n";
import { ABOUT_PATHS } from "@/lib/site-links";
import { staticPageMetadata } from "@/lib/site-metadata";

export const metadata: Metadata = staticPageMetadata({
  locale: "en",
  paths: ABOUT_PATHS,
  title: getMessages("en").about,
  description:
    "How Posvoji.si works: adoption through shelters, listing updates and free shelter participation. Content is published with permission.",
});

export default function About() {
  return <AboutPage locale="en" />;
}
