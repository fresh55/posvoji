import type { Metadata } from "next";
import { AnimalPage } from "@/components/animal-page";
import { animalPathParts, findAnimalBySlug } from "@/lib/animal-path";
import { animalMetadata } from "@/lib/animal-share";
import { loadDataset } from "@/lib/dataset";

// One page per animal in the dataset. They exist so a shared link has
// something to preview and a crawler has something to read; the index and its
// dialog remain where people browse.
export function generateStaticParams() {
  const dataset = loadDataset();
  return (dataset?.animals ?? []).map((animal) => animalPathParts(animal));
}

export const dynamicParams = false;

export async function generateMetadata({
  params,
}: PageProps<"/zival/[animal]/[city]/[shelter]">): Promise<Metadata> {
  const { animal: slug } = await params;
  const dataset = loadDataset();
  const animal = findAnimalBySlug(dataset?.animals ?? [], slug);
  if (!animal || !dataset) return {};
  return animalMetadata(animal, "sl", new Date(dataset.generatedAt));
}

export default async function ZivalPage({
  params,
}: PageProps<"/zival/[animal]/[city]/[shelter]">) {
  const { animal } = await params;
  return <AnimalPage locale="sl" slug={animal} />;
}
