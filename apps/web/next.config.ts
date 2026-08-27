import type { NextConfig } from "next";
import { warnAboutMissingMedia } from "./lib/build-media-check";

// A build needs `pnpm dataset:export` (or `pnpm images:derive`) to have
// populated public/media/ and data/dist/ first; skipping it produces a
// photo-less site that fails no check. See docs/DEPLOY-MEDIA.md. This config
// module loads once per process before Next spawns any workers, which is
// what keeps the warning to one line instead of one per worker or page.
warnAboutMissingMedia();

const nextConfig: NextConfig = {
  // Static files only. Nothing that needs a server at runtime belongs here;
  // images are already sized by the ingest pipeline.
  output: "export",
  images: {
    unoptimized: true,
  },
  // The schema package ships TypeScript source, not a build.
  transpilePackages: ["@posvoji/schema"],
};

export default nextConfig;
