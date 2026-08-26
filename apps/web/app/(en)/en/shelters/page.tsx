import type { Metadata } from "next";
import { SheltersPage } from "@/components/shelters-page";
import { indexMetadata } from "@/lib/page-share";

export const metadata: Metadata = indexMetadata("shelters", "en");

export default function Shelters() {
  return <SheltersPage locale="en" />;
}
