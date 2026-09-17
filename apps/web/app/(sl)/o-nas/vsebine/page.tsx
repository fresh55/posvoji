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
    "S čigavim dovoljenjem objavljamo živali slovenskih zavetišč, kaj objavimo privzeto, kaj določi zavetišče in kako se kadarkoli izključi.",
});

export default function DataPolicy() {
  return <DataPolicyPage locale="sl" />;
}
