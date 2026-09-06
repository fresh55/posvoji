import type { Metadata } from "next";
import { AboutPage } from "@/components/about-page";
import { getMessages } from "@/lib/i18n";
import { ABOUT_PATHS } from "@/lib/site-links";
import { staticPageMetadata } from "@/lib/site-metadata";

export const metadata: Metadata = staticPageMetadata({
  locale: "sl",
  paths: ABOUT_PATHS,
  // The same string the breadcrumb, the h1 and the footer link read, so the
  // head cannot end up naming the page something the page does not.
  title: getMessages("sl").about,
  description:
    "Posvoji.si je odprt in brezplačen seznam živali iz slovenskih zavetišč. Brez oglasov, odprta koda, podatki neposredno od zavetišč.",
});

export default function About() {
  return <AboutPage locale="sl" />;
}
