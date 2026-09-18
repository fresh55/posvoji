import { ArrowRight, Printer } from "lucide-react";
import { notFound } from "next/navigation";
import { AnimalFacts } from "@/components/animal-dialog/animal-facts";
import {
  AnimalPagePhotoProvider,
  AnimalPageShareButton,
} from "@/components/animal-page-photo-state";
import { ShelterBlock } from "@/components/animal-dialog/shelter-block";
import { PageBreadcrumb } from "@/components/page-breadcrumb";
import { AnimalPageGallery } from "@/components/animal-page-gallery";
import { StatusBadge } from "@/components/status-badge";
import { SiteFooter } from "@/components/site-footer";
import { SiteShell } from "@/components/site-shell";
import { animalFields } from "@/lib/animal";
import { permittedPhotos } from "@/lib/animal-images";
import { animalPath, findAnimalBySlug, posterPath } from "@/lib/animal-path";
import { loadDataset } from "@/lib/dataset";
import { getMessages, type Locale } from "@/lib/i18n";
import { getShelterLogos } from "@/lib/shelter-logos";
import { homePath, shelterPath } from "@/lib/shelter-path";
import { animalSubtitle } from "@/lib/labels";
import { cn } from "@/lib/utils";

/** The wider list, reached without reopening the animal being left. */
const pageText = {
  sl: {
    openInFinder: (count: number) => `Poglej vse živali (${count})`,
    /** The A4 sheet, for a notice board or a vet's waiting room. Drawn like
     *  the link above it and placed beside it, because it is the same kind of
     *  quiet way on: something a visitor may want after reading the page, not
     *  a second thing the page is asking them to do. */
    printPoster: "Natisni plakat",
  },
  en: {
    openInFinder: (count: number) => `View all animals (${count})`,
    printPoster: "Print poster",
  },
} satisfies Record<Locale, Record<string, string | ((count: number) => string)>>;

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
  const indexHref = homePath(locale);
  const images = permittedPhotos(animal.images);
  const hasPhoto = images.length > 0;
  // What crosses into the two client components below, which read no photo of
  // it. Handed the whole animal they serialized every image, its source URL,
  // its rights and its placeholder into this page's flight payload. See
  // animalFields in lib/animal.ts.
  const fields = animalFields(animal);

  return (
    <SiteShell
      locale={locale}
      languagePaths={{
        sl: animalPath(animal, "sl"),
        en: animalPath(animal, "en"),
      }}
      mainClassName="flex w-full max-w-5xl flex-1 flex-col gap-8 py-page-y"
      // The page a shared link lands on, and the one where the freshness line
      // earns the most: a stranger reading it has nothing else on the screen
      // that says whether the listing was captured last night or in March.
      footer={<SiteFooter locale={locale} updatedAt={dataset.generatedAt} />}
    >
      {/* Three crumbs and not four. The URL runs /zival/{animal}/{city}/
          {shelter}, but /zival, /zival/{animal} and /zival/{animal}/{city}
          are not routes and all three 404 (dynamicParams is false), so a
          trail mirroring the path would advertise pages that do not
          exist.

          The shelter is a crumb all the same, because it is not a segment
          of this URL: /zavetisca/{shelter} is a generated route of its
          own, and the register refuses to build if the dataset holds an
          animal for a shelter it does not list (shelters-page.tsx), so
          the page a crumb here points at always exists. It is also the
          word this page is searched for. The trail used to stop at the
          root, so the trail a search result printed read "Vse živali" and
          said nothing about where the animal is; PageBreadcrumb feeds one
          array to the row and to the JSON-LD, so the two say it together.
          The shelter is still named further down the page, with a link of
          its own, which is what a reader already on the page uses. */}
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
          trail={[
            {
              label: animal.shelter.name,
              href: shelterPath(animal.shelter.id, locale),
            },
          ]}
          current={animal.name ?? messages.unnamed}
        />

        {/* Two columns only when there is a photo to fill the first one.
            Without one the facts column sat alone beside an empty half.

            min-w-0 on both children because a grid item's automatic minimum
            is its min-content, so this column could not narrow past the
            longest word in the description. At a 150% root font that put the
            document at 401px inside a 390px viewport, at 200% at 533px, and
            the whole page scrolled sideways. */}
        <AnimalPagePhotoProvider count={images.length}>
          <div
            className={cn("grid gap-8", hasPhoto && "sm:grid-cols-2 sm:items-start")}
          >
            {hasPhoto && (
              <AnimalPageGallery
                // Resolved here rather than by the grid's client projection:
                // this page carries one animal, and its gallery blurs whichever
                // photo the visitor steps to, so every placeholder stays.
                images={images}
                name={animal.name}
                // The hero is half of a two-column grid inside max-w-5xl, so
                // it settles at 31rem once the page stops growing; between sm
                // and there it is a little under half the viewport, and below
                // sm it is the whole column.
                sizes="(min-width: 1024px) 31rem, (min-width: 640px) 47vw, 100vw"
                // rounded-xl and no border, which is the grid card's photo
                // frame (PHOTO_FRAME in animal-card.tsx): a visitor arrives
                // here from that photo, and the same picture should not change
                // shape or grow an edge of its own on the way. bg-muted stays,
                // as the ground the photo loads onto.
                className="relative aspect-[4/3] min-w-0 overflow-hidden rounded-xl bg-muted"
              />
            )}

            <div className="min-w-0 space-y-5">
              <div className="space-y-1">
                <div className="flex items-start justify-between gap-3">
                  {/* The status beside the name, the way the dialog sets it: a
                      reserved or adopted animal is a fact about the whole page
                      and belongs on the line that names it. */}
                  <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                    <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                      {animal.name ?? messages.unnamed}
                    </h1>
                    <StatusBadge status={animal.status} locale={locale} />
                  </div>
                  {/* A visitor who arrived by a shared link is the one most
                      likely to pass it on again. */}
                  <AnimalPageShareButton
                    path={animalPath(animal, locale)}
                    name={animal.name ?? messages.unnamed}
                  />
                </div>
                {/* The species and the breed as one muted line, which is how the
                    dialog prints them. This page drew the species as a filled
                    pill on a line of its own above the outlined fact badges, so
                    one fact wore a third badge style the dialog never used. */}
                <p className="text-sm text-muted-foreground">
                  {animalSubtitle(animal, locale)}
                </p>
              </div>

              <AnimalFacts animal={fields} reference={reference} />

              {/* The shelter and the one call to action, in the column beside
                  the photo rather than in a band under both. At 1440 the facts
                  ended a third of the way down the photo and the box then ran
                  the full width below it, so the page's one button sat under an
                  empty half-column. Beside the photo the column reads as the
                  dialog's card does: name, facts, then who to write to. Below
                  sm there is one column and nothing moves. */}
              <ShelterBlock
                animal={fields}
                logos={getShelterLogos()}
                reference={reference}
              />
            </div>
          </div>
        </AnimalPagePhotoProvider>
      </div>

      {/* A link, not an outline button. The page has one call to
          action, on the shelter block above, and a second bordered
          control under it asked the visitor to choose between leaving
          for the shelter and staying on the site. This is the quiet way
          on, so it is drawn as the quiet thing it is. */}
      {/* Both ways on off this page, in one row and in one voice. The
          gap is wide enough that the two read as two links rather than
          as one wrapped sentence, and they stack at a width that cannot
          hold both. */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <a
            href={indexHref}
            className="inline-flex items-center gap-1.5 rounded-ui text-sm text-muted-foreground underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring max-lg:tap-target"
          >
            {text.openInFinder(dataset.animals.length)}
            <ArrowRight className="size-4 shrink-0" aria-hidden />
          </a>

          {/* The same classes as the link beside it, down to the focus
              ring and the tap target: this is the second quiet way on,
              not a second call to action, and the page still has exactly
              one of those on the shelter block above.
              The mark leads rather than trails. The arrow next door points
              at where that link goes, which is the whole of what it says;
              a printer is the subject of this one, and it is what tells
              the two links apart at a glance in a row. */}
          <a
            href={posterPath(animal, locale)}
            className="inline-flex items-center gap-1.5 rounded-ui text-sm text-muted-foreground underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring max-lg:tap-target"
          >
            <Printer className="size-4 shrink-0" aria-hidden />
            {text.printPoster}
          </a>
      </div>
    </SiteShell>
  );
}
