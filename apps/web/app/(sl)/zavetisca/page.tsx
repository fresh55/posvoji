import type { Metadata } from "next";
import { SheltersPage } from "@/components/shelters-page";
import { indexMetadata } from "@/lib/page-share";

export const metadata: Metadata = indexMetadata("shelters", "sl");

export default function Zavetisca() {
  return <SheltersPage locale="sl" />;
}
