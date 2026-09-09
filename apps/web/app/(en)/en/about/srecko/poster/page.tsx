import type { Metadata } from "next";
import { SreckoPosterPage } from "@/components/poster/srecko-poster-page";

export const metadata: Metadata = {
  // See the Slovenian route, for the absolute title as well: the <title> here
  // is the printed file's name.
  title: { absolute: "Srečko: poster" },
  // See the Slovenian route: the sheet must not compete with his own page in
  // a search result.
  robots: { index: false, follow: false },
};

export default function SreckoPoster() {
  return <SreckoPosterPage locale="en" />;
}
