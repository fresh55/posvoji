import type { Metadata } from "next";
import { AboutPage } from "@/components/about-page";
import { getMessages } from "@/lib/i18n";
import { ABOUT_PATHS } from "@/lib/site-links";
import { staticPageMetadata } from "@/lib/site-metadata";
import { sreckoShareImage } from "@/lib/srecko";

export const metadata: Metadata = staticPageMetadata({
  locale: "en",
  paths: ABOUT_PATHS,
  title: getMessages("en").about,
  description:
    "Posvoji.si is an open, free index of animals in Slovenian shelters. No ads, open source, data straight from the shelters.",
  // The same card the Slovenian page shows: it carries no sentence, so one
  // file serves both languages and only the alt text changes.
  image: sreckoShareImage("en", "about"),
});

export default function About() {
  return <AboutPage locale="en" />;
}
