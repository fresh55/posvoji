import type { Metadata } from "next";
import { AnimalPage } from "@/components/animal-page";
import { animalPathParts, findAnimalBySlug } from "@/lib/animal-path";
import { animalMetadata } from "@/lib/animal-share";
import { loadDataset } from "@/lib/dataset";

// One page per animal in the dataset. They exist so a shared link has
// something to preview and a crawler has something to read; the index and its
// dialog remain where people browse.
// A static export needs at least one path per dynamic route, and a checkout
// without an exported dataset (CI, a fresh clone) has no animals to name. The
// placeholder builds the same not-found page a stale link already gets.
const NO_ANIMALS = [
  { animal: "ni-zivali", city: "slovenija", shelter: "zavetisce" },
];

export function generateStaticParams() {
  const params = (loadDataset()?.animals ?? []).map((animal) =>
    animalPathParts(animal),
  );
  return params.length > 0 ? params : NO_ANIMALS;
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
