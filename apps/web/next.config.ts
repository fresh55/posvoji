import type { NextConfig } from "next";

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
