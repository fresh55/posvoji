import type { Metadata } from "next";
import { DataPolicyPage, dataPolicyTitle } from "@/components/data-policy-page";
import { DATA_POLICY_PATHS } from "@/lib/site-links";
import { staticPageMetadata } from "@/lib/site-metadata";

export const metadata: Metadata = staticPageMetadata({
  locale: "sl",
  paths: DATA_POLICY_PATHS,
  // The string the breadcrumb and the h1 read, from the component that owns
  // it, so the head cannot name the page something the page does not.
  title: dataPolicyTitle("sl"),
  description:
    "Kako z dovoljenjem zavetišč objavljamo živali, fotografije in opise, varujemo zasebnost ter uredimo popravek ali umik vsebin.",
});

export default function DataPolicy() {
  return <DataPolicyPage locale="sl" />;
}
