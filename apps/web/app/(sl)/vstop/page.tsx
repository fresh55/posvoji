import type { Metadata } from "next";
import { DemoGatePage } from "@/components/demo-gate-page";
import { GATE_PATHS } from "@/lib/demo-gate";
import { localeAlternates } from "@/lib/site-metadata";

// staticPageMetadata is the wrong fit: it has no robots field and would put an
// og:image on a noindex page. localeAlternates is the half that applies, so
// the pair still names itself the way every other paired route does.
export const metadata: Metadata = {
  title: "Vstop",
  robots: { index: false, follow: false },
  alternates: localeAlternates(GATE_PATHS, "sl"),
};

export default function Gate() {
  return <DemoGatePage locale="sl" />;
}
