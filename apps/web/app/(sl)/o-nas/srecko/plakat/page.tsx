import type { Metadata } from "next";
import { SreckoPosterPage } from "@/components/poster/srecko-poster-page";

export const metadata: Metadata = {
  title: { absolute: "Srečko: plakat" },
  robots: { index: false, follow: false },
};

export default function SreckoPlakat() {
  return <SreckoPosterPage locale="sl" />;
}
