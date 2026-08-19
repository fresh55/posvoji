import type { Metadata } from "next";
import { AnimalPage } from "@/components/animal-page";
import { animalPathParts, findAnimalBySlug } from "@/lib/animal-path";
import { animalMetadata } from "@/lib/animal-share";
import { loadDataset } from "@/lib/dataset";

export function generateStaticParams() {
  const dataset = loadDataset();
  return (dataset?.animals ?? []).map((animal) => animalPathParts(animal));
}

export const dynamicParams = false;

export async function generateMetadata({
  params,
}: PageProps<"/en/animal/[animal]/[city]/[shelter]">): Promise<Metadata> {
  const { animal: slug } = await params;
  const dataset = loadDataset();
  const animal = findAnimalBySlug(dataset?.animals ?? [], slug);
  if (!animal || !dataset) return {};
  return animalMetadata(animal, "en", new Date(dataset.generatedAt));
}

export default async function AnimalDetailPage({
  params,
}: PageProps<"/en/animal/[animal]/[city]/[shelter]">) {
  const { animal } = await params;
  return <AnimalPage locale="en" slug={animal} />;
}
