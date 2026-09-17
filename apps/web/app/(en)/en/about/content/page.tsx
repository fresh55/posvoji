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
    "How we publish shelter listings, photos and descriptions with permission, respect your privacy and handle corrections or content removal.",
});

export default function DataPolicy() {
  return <DataPolicyPage locale="en" />;
}
