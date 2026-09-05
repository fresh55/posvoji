import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { I18nProvider } from "@/components/i18n-provider";
import { AnimalPoster } from "@/components/poster/animal-poster";
import { PrintButton } from "@/components/poster/print-button";
import { animalPath, findAnimalBySlug } from "@/lib/animal-path";
import { loadDataset } from "@/lib/dataset";
import { getMessages, type Locale } from "@/lib/i18n";
import { getShelterLogos } from "@/lib/shelter-logos";
import { getShelterPhones } from "@/lib/shelters";

/**
 * The poster route's screen view: a bar, and the sheet under it.
 *
 * No site header, no footer, no back-to-top. This page is a printer's
 * viewfinder, and everything the site puts around a page would be one more
 * thing between the volunteer and the paper. The two controls are the two
 * things they can want here: back to the animal they came from, and print.
 *
 * The sheet is drawn at the true 210:297 and scaled to whatever the viewport
 * can hold (see --u in poster.css), so what is on screen is what comes out of
 * the printer rather than a differently laid-out preview of it.
 */
export function PosterPage({ locale, slug }: { locale: Locale; slug: string }) {
  const dataset = loadDataset();
  const animal = findAnimalBySlug(dataset?.animals ?? [], slug);
  if (!animal || !dataset) notFound();

  const messages = getMessages(locale);
  const name = animal.name ?? messages.unnamed;

  return (
    <I18nProvider locale={locale}>
      {/* Named rather than styled away in print: the print block hides
          .poster-chrome, and anything that is site furniture on this route
          wears that class. */}
      <div className="poster-chrome flex items-center justify-between gap-3 border-b px-gutter py-2">
        {/* The animal's own name and not messages.backToAnimals: the way back
            from a sheet is the page it was made from, and there is exactly one
            of those. */}
        <a
          href={animalPath(animal, locale)}
          className="inline-flex items-center gap-1.5 rounded-ui text-sm text-muted-foreground underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring max-lg:tap-target"
        >
          <ArrowLeft className="size-4 shrink-0" aria-hidden />
          {name}
        </a>
        <PrintButton />
      </div>

      <div className="poster-stage">
        <AnimalPoster
          animal={animal}
          locale={locale}
          generatedAt={dataset.generatedAt}
          logos={getShelterLogos()}
          phones={getShelterPhones()}
        />
      </div>
    </I18nProvider>
  );
}
