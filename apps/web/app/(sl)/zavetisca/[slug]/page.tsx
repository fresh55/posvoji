import type { Metadata } from "next";
import { ShelterDetailPage } from "@/components/shelter-detail-page";
import { loadDataset } from "@/lib/dataset";
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
}: PageProps<"/zavetisca/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const shelter = getShelterBySlug(slug);
  if (!shelter) return {};
  // The same question the page body answers before it draws the animals
  // section, asked here so the description does not promise a list the page
  // does not have. loadDataset caches, so this costs one read for the build.
  const hasAnimals = (loadDataset()?.animals ?? []).some(
    (animal) => animal.shelter.id === shelter.id,
  );
  return shelterMetadata(shelter, "sl", hasAnimals);
}

export default async function ZavetiscePage({
  params,
}: PageProps<"/zavetisca/[slug]">) {
  const { slug } = await params;
  return <ShelterDetailPage locale="sl" slug={slug} />;
}
