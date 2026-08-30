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
  experimental: {
    // The app has two root layouts, (sl) and (en)/en, and no shared one
    // above them: see app/global-not-found.tsx. Without this flag there is
    // no root layout left for a plain app/not-found.tsx to render inside,
    // so a URL that matches neither locale's routes falls through to
    // Next's bare default 404 instead of the branded page.
    globalNotFound: true,
  },
};

export default nextConfig;
