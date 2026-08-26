import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// Nothing here is private and nothing here is generated per visitor, so there
// is nothing to keep a crawler out of. The file exists for its second line:
// without it the sitemap is only found by whoever is told about it.

// Required by `output: "export"`; app/sitemap.ts explains why.
export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/" }],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
