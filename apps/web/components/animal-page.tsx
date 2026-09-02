import { ArrowRight } from "lucide-react";
import { notFound } from "next/navigation";
import { AnimalFacts } from "@/components/animal-dialog/animal-facts";
import { ShareButton } from "@/components/animal-dialog/share-button";
import { ShelterBlock } from "@/components/animal-dialog/shelter-block";
import { I18nProvider } from "@/components/i18n-provider";
import { PageBreadcrumb } from "@/components/page-breadcrumb";
import { PhotoGallery } from "@/components/photo-gallery";
import { StatusBadge } from "@/components/status-badge";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Badge } from "@/components/ui/badge";
import { animalFields } from "@/lib/animal";
import { permittedPhotos } from "@/lib/animal-images";
import { animalPath, findAnimalBySlug } from "@/lib/animal-path";
import { loadDataset } from "@/lib/dataset";
import { getMessages, type Locale } from "@/lib/i18n";
import { getShelterLogos } from "@/lib/shelter-logos";
import { getShelterPhones } from "@/lib/shelters";
import { speciesLabel } from "@/lib/labels";
import { cn } from "@/lib/utils";

/** The label names the destination, not the mechanism.
 *
 *  "Odpri med vsemi živalmi" described what the link does to the index (it
 *  opens this animal there) rather than where the visitor arrives, and read as
 *  a second call to action beside the shelter's. What the link is for is the
 *  way on from a shared link: someone who followed this page from a post has
 *  seen one animal and has no idea 502 others are behind it. Naming the list
 *  and counting it says that in the words the visitor would use, and it stops
 *  competing with "Odpri objavo pri zavetišču", which is the page's one real
 *  call to action.
 *
 *  A count and not a bare "back": there is nothing to go back to on a first
 *  visit from Facebook, and the number is the whole invitation. */
const pageText = {
  sl: {
    openInFinder: (count: number) => `Poglej vse živali (${count})`,
  },
  en: {
    openInFinder: (count: number) => `See all animals (${count})`,
  },
} satisfies Record<Locale, Record<string, (count: number) => string>>;

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
  // What crosses into the two client components below, which read no photo of
  // it. Handed the whole animal they serialized every image, its source URL,
  // its rights and its placeholder into this page's flight payload. See
  // animalFields in lib/animal.ts.
  const fields = animalFields(animal);

  return (
    <I18nProvider locale={locale}>
      <div className="mx-auto flex min-h-dvh w-full max-w-7xl flex-col px-gutter">
        <SiteHeader
          homeHref={indexHref}
          languagePaths={{
            sl: animalPath(animal, "sl"),
            en: animalPath(animal, "en"),
          }}
        />

        <main className="flex w-full max-w-5xl flex-1 flex-col gap-8 py-page-y">
          {/* Two crumbs and not four. The URL runs /zival/{animal}/{city}/
              {shelter}, but /zival, /zival/{animal} and /zival/{animal}/{city}
              are not routes and all three 404 (dynamicParams is false), so a
              trail mirroring the path would advertise pages that do not
              exist. The animal's shelter is named further down the page, with
              a link of its own. */}
          {/* space-y-5 rather than the main's own gap-8, so the trail sits
              20px above what it introduces here as it does on every other
              page. A breadcrumb is the same distance from its page whatever
              the page turns out to be. */}
          <div className="space-y-5">
            {/* messages.unnamed and not text.back: the fallback used to be
                "Vse živali", which is the root crumb's own label word for
                word, so an animal the shelter left unnamed wore the trail
                "Vse živali > Vse živali", in the JSON-LD as well as on the
                page. The h1 below already calls it what this calls it. */}
            <PageBreadcrumb
              locale={locale}
              current={animal.name ?? messages.unnamed}
            />

            {/* Two columns only when there is a photo to fill the first one.
                Without one the facts column sat alone beside an empty half. */}
            <div className={cn("grid gap-8", hasPhoto && "sm:grid-cols-2 sm:items-start")}>
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

              <AnimalFacts animal={fields} reference={reference} />
            </div>
            </div>
          </div>

          <div className="space-y-4">
            <ShelterBlock
              animal={fields}
              logos={getShelterLogos()}
              phones={getShelterPhones()}
              reference={reference}
            />

            {/* ?zival= is how a page outside the list asks the list to open
                an animal. The index swaps it for this page's own address as
                soon as it has read it, so the two agree on where the animal
                lives, and old links written before that address existed keep
                working. */}
            {/* A link, not an outline button. The page has one call to
                action, on the shelter block above, and a second bordered
                control under it asked the visitor to choose between leaving
                for the shelter and staying on the site. This is the quiet way
                on, so it is drawn as the quiet thing it is. */}
            <a
              href={`${indexHref}?zival=${encodeURIComponent(animal.id)}`}
              className="inline-flex items-center gap-1.5 rounded-ui text-sm text-muted-foreground underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring max-lg:tap-target"
            >
              {text.openInFinder(dataset.animals.length)}
              <ArrowRight className="size-4 shrink-0" aria-hidden />
            </a>
          </div>
        </main>

        <SiteFooter locale={locale} />
      </div>
    </I18nProvider>
  );
}
