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
  locale: "en",
  paths: SRECKO_PATHS,
  title: SRECKO.name,
  description: SRECKO_TEXT.en.intro,
  image: sreckoShareImage("en", "memorial"),
});

export default function Srecko() {
  return <SreckoPage locale="en" />;
}
