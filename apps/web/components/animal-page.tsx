import { ArrowRight } from "lucide-react";
import { notFound } from "next/navigation";
import { AnimalFacts } from "@/components/animal-dialog/animal-facts";
import { ShareButton } from "@/components/animal-dialog/share-button";
import { ShelterBlock } from "@/components/animal-dialog/shelter-block";
import { I18nProvider } from "@/components/i18n-provider";
import { PhotoGallery } from "@/components/photo-gallery";
import { StatusBadge } from "@/components/status-badge";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { permittedPhotos } from "@/lib/animal-images";
import { animalPath, findAnimalBySlug } from "@/lib/animal-path";
import { loadDataset } from "@/lib/dataset";
import { getMessages, type Locale } from "@/lib/i18n";
import { getShelterLogos } from "@/lib/shelter-logos";
import { speciesLabel } from "@/lib/labels";

const pageText = {
  sl: {
    back: "Vse živali",
    openInFinder: "Odpri med vsemi živalmi",
  },
  en: {
    back: "All animals",
    openInFinder: "Open in the full list",
  },
} satisfies Record<Locale, Record<string, string>>;

/**
 * Where a shared link lands. The dialog on the index is the place to browse
 * from, but a link posted on Facebook has to open something a crawler can
 * read and a stranger can understand on its own, so this page states the same
 * facts as the dialog and hands the visitor back to the list.
 */
export function AnimalPage({ locale, slug }: { locale: Locale; slug: string }) {
  const dataset = loadDataset();
  const animal = findAnimalBySlug(dataset?.animals ?? [], slug);
  if (!animal || !dataset) notFound();

  const messages = getMessages(locale);
  const text = pageText[locale];
  const reference = new Date(dataset.generatedAt);
  const indexHref = locale === "sl" ? "/" : "/en";
  const hasPhoto = animal.images.length > 0;

  return (
    <I18nProvider locale={locale}>
      <div className="mx-auto flex min-h-full w-full max-w-7xl flex-col px-gutter">
        <SiteHeader
          homeHref={indexHref}
          languagePaths={{
            sl: animalPath(animal, "sl"),
            en: animalPath(animal, "en"),
          }}
        />

        <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 py-page-y">
          <a
            href={indexHref}
            className="inline-flex text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            ← {text.back}
          </a>

          <div className="grid gap-8 sm:grid-cols-2 sm:items-start">
            {hasPhoto && (
              <PhotoGallery
                // Resolved here rather than by the grid's client projection:
                // this page carries one animal, and its gallery blurs whichever
                // photo the visitor steps to, so every placeholder stays.
                images={permittedPhotos(animal.images)}
                name={animal.name}
                // The hero is half of a two-column grid inside max-w-5xl, so
                // it settles at 31rem once the page stops growing; between sm
                // and there it is a little under half the viewport, and below
                // sm it is the whole column.
                sizes="(min-width: 1024px) 31rem, (min-width: 640px) 47vw, 100vw"
                // The page's own subject, above the fold, and the largest
                // thing on it.
                eager
                // The one surface that asks for the top of the ladder anyway:
                // a phone gives it the full width, and a desktop gives it
                // 31rem, which is 992px on a 2x screen.
                avif
                className="relative aspect-[4/3] overflow-hidden rounded-ui border bg-muted"
              />
            )}

            <div className="space-y-5">
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <h1 className="text-2xl font-medium tracking-tight sm:text-3xl">
                    {animal.name ?? messages.unnamed}
                  </h1>
                  {/* A visitor who arrived by a shared link is the one most
                      likely to pass it on again. */}
                  <ShareButton
                    path={animalPath(animal, locale)}
                    name={animal.name ?? messages.unnamed}
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">
                    {speciesLabel(animal.species, locale)}
                  </Badge>
                  <StatusBadge status={animal.status} locale={locale} />
                </div>
              </div>

              <AnimalFacts animal={animal} reference={reference} />
            </div>
          </div>

          <div className="space-y-4">
            <ShelterBlock
              animal={animal}
              logos={getShelterLogos()}
              reference={reference}
            />

            {/* ?zival= is how a page outside the list asks the list to open
                an animal. The index swaps it for this page's own address as
                soon as it has read it, so the two agree on where the animal
                lives, and old links written before that address existed keep
                working. */}
            <Button asChild variant="outline" size="sm">
              <a href={`${indexHref}?zival=${encodeURIComponent(animal.id)}`}>
                {text.openInFinder}
                <ArrowRight aria-hidden />
              </a>
            </Button>
          </div>
        </main>

        <SiteFooter locale={locale} />
      </div>
    </I18nProvider>
  );
}
