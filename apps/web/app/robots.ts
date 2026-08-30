import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/**
 * What a crawler may read, and where the list of it is.
 *
 * The site had no robots.txt, which is not a permissive default so much as an
 * absent one: nothing pointed at the sitemap, and the two paths that should
 * never be indexed relied entirely on a meta tag in their own head, which is
 * only read after the page has been fetched.
 *
 * /portal is a shelter's own workspace behind a magic link and /dev is a
 * drawing tool for the map. Both already answer robots: { index: false } in
 * their metadata; this is the same statement made before the fetch rather
 * than after it.
 */
// robots.txt is a Route Handler, and under output: export a handler has to
// say so: without this the build stops on "export const dynamic =
// force-static not configured". Nothing here reads a request, so the file is
// written once at build time, which is all a static export can serve.
export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/portal", "/dev/"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
