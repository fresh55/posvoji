import type { Metadata } from "next";
import { SreckoPage } from "@/components/srecko-page";
import {
  SRECKO,
  SRECKO_PATHS,
  SRECKO_SHARE_IMAGE,
} from "@/lib/srecko";
import { staticPageMetadata } from "@/lib/site-metadata";

export const metadata: Metadata = staticPageMetadata({
  locale: "en",
  paths: SRECKO_PATHS,
  title: SRECKO.name,
  description:
    "Srečko was a cat with one eye and a positive FeLV test. He came from a shelter and was adopted. This site is in memory of him.",
  image: {
    url: SRECKO_SHARE_IMAGE.url,
    width: SRECKO_SHARE_IMAGE.width,
    height: SRECKO_SHARE_IMAGE.height,
    alt: SRECKO_SHARE_IMAGE.alt.en,
  },
});

export default function Srecko() {
  return <SreckoPage locale="en" />;
}
