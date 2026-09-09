import type { Metadata } from "next";
import { SreckoPosterPage } from "@/components/poster/srecko-poster-page";

// The printable sheet beside Srečko's page, the same one every animal in the
// register has. A volunteer hangs an animal's sheet in a waiting room; this
// one is here because he is listed the way they are, and a page that leaves
// out the one thing every other listing has is a page that treats him as an
// exception.
export const metadata: Metadata = {
  // absolute, so the root layout's "| Posvoji.si" does not reach it. See the
  // animal sheet's route: on a printing page the <title> is the PDF's file
  // name rather than a heading.
  title: { absolute: "Srečko: plakat" },
  // Not indexed, and no link preview either. This sheet is a copy of his page
  // with a QR on it: in a search result it would compete with that page, and
  // it is the page that has to win. Nothing here is secret, so the sheet stays
  // fetchable and the directive stays readable; it is left out of
  // app/sitemap.ts for the same reason.
  robots: { index: false, follow: false },
};

export default function SreckoPlakat() {
  return <SreckoPosterPage locale="sl" />;
}
