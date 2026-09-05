import type { Metadata } from "next";
import { PosterPage } from "@/components/poster/poster-page";
import { animalPathParts, findAnimalBySlug } from "@/lib/animal-path";
import { loadDataset } from "@/lib/dataset";
import { getMessages } from "@/lib/i18n";

// One printable sheet per animal, beside the animal's own page. A volunteer
// hangs it in a vet's waiting room or a shop window; the QR on it points back
// at the animal's page, which is the copy that stays current.
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
}: PageProps<"/zival/[animal]/[city]/[shelter]/plakat">): Promise<Metadata> {
  const { animal: slug } = await params;
  const animal = findAnimalBySlug(loadDataset()?.animals ?? [], slug);
  if (!animal) return {};
  return {
    title: `${animal.name ?? getMessages("sl").unnamed}: plakat`,
    // Not indexed, and no link preview either. This sheet is a copy of the
    // animal's own page with a QR on it: in a search result it would compete
    // with that page for the same animal, and it is the page that has to win.
    // Nothing here is secret, so the sheet stays fetchable and the directive
    // stays readable; it is left out of app/sitemap.ts for the same reason.
    robots: { index: false, follow: false },
  };
}

export default async function PlakatPage({
  params,
}: PageProps<"/zival/[animal]/[city]/[shelter]/plakat">) {
  const { animal } = await params;
  return <PosterPage locale="sl" slug={animal} />;
}
