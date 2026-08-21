import type { Metadata } from "next";
import { ShelterDetailPage } from "@/components/shelter-detail-page";
import { shelterMetadata } from "@/lib/shelter-share";
import { getShelterBySlug, loadShelters } from "@/lib/shelters";

// Every registered shelter gets a page, even with zero animals in the
// dataset today: the registry, not the dataset, is the source of truth for
// which shelters exist.
export function generateStaticParams() {
  return loadShelters().map((shelter) => ({ slug: shelter.id }));
}

export const dynamicParams = false;

export async function generateMetadata({
  params,
}: PageProps<"/en/shelters/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const shelter = getShelterBySlug(slug);
  if (!shelter) return {};
  return shelterMetadata(shelter, "en");
}

export default async function ShelterPage({
  params,
}: PageProps<"/en/shelters/[slug]">) {
  const { slug } = await params;
  return <ShelterDetailPage locale="en" slug={slug} />;
}
