import type { Metadata } from "next";
import { SitePage } from "@/components/site-page";
import { indexMetadata } from "@/lib/page-share";

export const metadata: Metadata = indexMetadata("home", "en");

export default function Home() {
  return <SitePage locale="en" />;
}
