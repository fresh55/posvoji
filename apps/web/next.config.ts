import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The whole site is static files on a CDN — there is no server. Anything
  // that would require one (image optimizer, route handlers, server actions)
  // must stay out; images are pre-sized by the ingest pipeline instead.
  output: "export",
  images: {
    unoptimized: true,
  },
  // The schema package ships TypeScript source, not a build.
  transpilePackages: ["@posvoji/schema"],
};

export default nextConfig;
