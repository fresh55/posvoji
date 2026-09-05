import type { Metadata } from "next";
import { PosterPage } from "@/components/poster/poster-page";
import { animalPathParts, findAnimalBySlug } from "@/lib/animal-path";
import { loadDataset } from "@/lib/dataset";
import { getMessages } from "@/lib/i18n";

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
}: PageProps<"/en/animal/[animal]/[city]/[shelter]/poster">): Promise<Metadata> {
  const { animal: slug } = await params;
  const animal = findAnimalBySlug(loadDataset()?.animals ?? [], slug);
  if (!animal) return {};
  return {
    title: `${animal.name ?? getMessages("en").unnamed}: poster`,
    // See the Slovenian route: the sheet must not compete with the animal's
    // own page in a search result.
    robots: { index: false, follow: false },
  };
}

export default async function AnimalPosterPage({
  params,
}: PageProps<"/en/animal/[animal]/[city]/[shelter]/poster">) {
  const { animal } = await params;
  return <PosterPage locale="en" slug={animal} />;
}
