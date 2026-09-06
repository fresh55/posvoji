import { notFound } from "next/navigation";

// Next's static exporter rejects an empty parameter list. Generate one inert
// production path so the build can complete; the web package's post-build step
// removes the whole exported /dev tree before it can become a soft 404.
export function generateStaticParams() {
  return process.env.NODE_ENV === "production"
    ? [{ tool: "__production-disabled__" }]
    : [{ tool: "map" }];
}

export const dynamicParams = false;

export default async function DevToolPage({
  params,
}: PageProps<"/dev/[tool]">) {
  const { tool } = await params;
  if (tool !== "map" || process.env.NODE_ENV === "production") notFound();
  const { MapStatesGallery } = await import("../map/map-states-gallery");
  return <MapStatesGallery />;
}
