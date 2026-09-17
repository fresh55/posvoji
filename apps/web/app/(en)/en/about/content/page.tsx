import type { Metadata } from "next";
import { DataPolicyPage, dataPolicyTitle } from "@/components/data-policy-page";
import { DATA_POLICY_PATHS } from "@/lib/site-links";
import { staticPageMetadata } from "@/lib/site-metadata";

export const metadata: Metadata = staticPageMetadata({
  locale: "en",
  paths: DATA_POLICY_PATHS,
  // The English half of the pair. See the note on the /o-nas/vsebine route.
  title: dataPolicyTitle("en"),
  description:
    "Whose permission Slovenian shelter listings rest on, what we publish by default, what each shelter decides and how it opts out at any time.",
});

export default function DataPolicy() {
  return <DataPolicyPage locale="en" />;
}
