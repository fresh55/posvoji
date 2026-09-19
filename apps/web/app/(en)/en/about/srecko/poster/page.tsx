import type { Metadata } from "next";
import { SreckoPosterPage } from "@/components/poster/srecko-poster-page";

export const metadata: Metadata = {
  title: { absolute: "Srečko: poster" },
  robots: { index: false, follow: false },
};

export default function SreckoPoster() {
  return <SreckoPosterPage locale="en" />;
}
