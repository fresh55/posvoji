import type { Metadata } from "next";
import { SitePage } from "@/components/site-page";
import { indexMetadata } from "@/lib/page-share";

export const metadata: Metadata = indexMetadata("home", "sl");

export default function Home() {
  return <SitePage locale="sl" />;
}
