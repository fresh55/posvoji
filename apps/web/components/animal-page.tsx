import { ArrowRight } from "lucide-react";
import { notFound } from "next/navigation";
import { AnimalFacts } from "@/components/animal-dialog/animal-facts";
import { PhotoSpread } from "@/components/animal-dialog/photo-spread";
import { ShareButton } from "@/components/animal-dialog/share-button";
import { ShelterBlock } from "@/components/animal-dialog/shelter-block";
import { I18nProvider } from "@/components/i18n-provider";
import { DETAIL_TITLE_CLASS, PageShell } from "@/components/page-shell";
import { StatusBadge } from "@/components/status-badge";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { animalPath, findAnimalBySlug } from "@/lib/animal-path";
import { loadDataset } from "@/lib/dataset";
import { getMessages, type Locale } from "@/lib/i18n";
import { ROUTES } from "@/lib/routes";
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
  const indexHref = ROUTES.home[locale];
  const hasPhoto = animal.images.length > 0;

  return (
    <I18nProvider locale={locale}>
      <PageShell>
        <SiteHeader
          locale={locale}
          homeHref={indexHref}
          languagePaths={{
            sl: animalPath(animal, "sl"),
            en: animalPath(animal, "en"),
          }}
        />

        <main className="flex flex-1 flex-col gap-8 py-page-y">
          <a
            href={indexHref}
            className="inline-flex text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            ← {text.back}
          </a>

          {/* The same fan the dialog draws, not the dot carousel this page
              used to. A carousel shows one photo and hides the rest behind a
              gesture nobody performs on a page they arrived at from a link,
              and this is the page shared links land on. The fan also takes
              the full column width, which is what the old two-column split
              could not do: a 4/3 photo beside a short fact list left the
              right half of the page empty under it on every animal whose
              shelter had recorded little. */}
          {/* entrance={false} renders the fan at its final pose on load. The
              entrance animation belongs to the dialog, where opening is the
              interaction it answers; a server-rendered page shows its photos
              immediately, including before hydration. */}
          {hasPhoto && <PhotoSpread animal={animal} entrance={false} />}

          <div className="space-y-5">
            <div className="space-y-2">
              <div className="flex items-start justify-between gap-3">
                <h1 className={DETAIL_TITLE_CLASS}>
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
      </PageShell>
    </I18nProvider>
  );
}
