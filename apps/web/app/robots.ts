import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/**
 * What a crawler may read, and where the list of it is.
 *
 * The site had no robots.txt, which is not a permissive default so much as an
 * absent one: nothing pointed at the sitemap.
 *
 * /dev is a drawing tool for the map, linked from nowhere and 404 in
 * production, and it carries no noindex of its own. A Disallow is the whole
 * answer for it.
 *
 * /portal is not listed, and that is deliberate. It is a shelter's own
 * workspace behind a magic link, and both of its pages already answer
 * robots: { index: false, follow: false } in their own head. Disallow is the
 * wrong tool for a page the site links to: lib/site-links.ts puts
 * /portal/prijava in the header of every page, so a crawler finds the URL
 * whatever robots.txt says, and a disallowed URL is one it may not fetch,
 * not one it may not index. Blocked plus linked is exactly the case where
 * Google lists the bare address with no title and no description, and the
 * noindex that would have stopped it sits in a head nobody is allowed to
 * read. Letting the fetch through is what makes the noindex count.
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
      disallow: ["/dev/"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
