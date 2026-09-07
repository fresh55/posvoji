import type { Metadata } from "next";
import { SreckoPage } from "@/components/srecko-page";
import {
  SRECKO,
  SRECKO_PATHS,
  SRECKO_SHARE_IMAGE,
} from "@/lib/srecko";
import { staticPageMetadata } from "@/lib/site-metadata";

export const metadata: Metadata = staticPageMetadata({
  locale: "sl",
  paths: SRECKO_PATHS,
  // His name, the way the h1 and the last crumb say it.
  title: SRECKO.name,
  description:
    "Srečko je bil maček z enim očesom in pozitivnim testom na FeLV. Prišel je iz zavetišča in bil posvojen. Ta stran je v spomin nanj.",
  image: {
    url: SRECKO_SHARE_IMAGE.url,
    width: SRECKO_SHARE_IMAGE.width,
    height: SRECKO_SHARE_IMAGE.height,
    alt: SRECKO_SHARE_IMAGE.alt.sl,
  },
});

export default function Srecko() {
  return <SreckoPage locale="sl" />;
}
