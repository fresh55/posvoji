import type { Metadata } from "next";
import { SreckoPage } from "@/components/srecko-page";
import {
  SRECKO,
  SRECKO_PATHS,
  sreckoShareImage,
  SRECKO_TEXT,
} from "@/lib/srecko";
import { staticPageMetadata } from "@/lib/site-metadata";

export const metadata: Metadata = staticPageMetadata({
  locale: "sl",
  paths: SRECKO_PATHS,
  // His name, the way the h1 and the last crumb say it.
  title: SRECKO.name,
  description: SRECKO_TEXT.sl.intro,
  image: sreckoShareImage("sl", "memorial"),
});

export default function Srecko() {
  return <SreckoPage locale="sl" />;
}
