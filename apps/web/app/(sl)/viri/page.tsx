import type { Metadata } from "next";
import { ResourcesPage } from "@/components/resources-page";
import { indexMetadata } from "@/lib/page-share";

export const metadata: Metadata = indexMetadata("resources", "sl");

export default function Resources() {
  return <ResourcesPage locale="sl" />;
}
