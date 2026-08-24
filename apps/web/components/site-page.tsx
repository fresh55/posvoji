import { AnimalGrid } from "@/components/animal-grid";
import { FoundAnimalButton } from "@/components/found-animal-button";
import { I18nProvider } from "@/components/i18n-provider";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { loadDataset } from "@/lib/dataset";
import { getMessages, type Locale } from "@/lib/i18n";
import { shelterCount } from "@/lib/labels";
import { buildMunicipalityEntries } from "@/lib/municipality-coverage";
import { getShelterLogos } from "@/lib/shelter-logos";
import { loadShelters } from "@/lib/shelters";

export function SitePage({ locale }: { locale: Locale }) {
  const dataset = loadDataset();
  const animals = dataset?.animals ?? [];
  const municipalities = buildMunicipalityEntries(locale, animals);
  const onSiteIds = new Set(animals.map((animal) => animal.shelter.id));
  const shelters = onSiteIds.size;
  // Registry shelters with no animals on the site. The location picker shows
  // them as inert markers and rows, so the map answers "where are Slovenia's
  // shelters" and not just "where are ours".
  const offSiteShelters = loadShelters()
    .filter((shelter) => !onSiteIds.has(shelter.id))
    .map((shelter) => ({
      value: shelter.id,
      label: shelter.name,
      city: shelter.city,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "sl"));
  const messages = getMessages(locale);

  return (
    <I18nProvider locale={locale}>
      <div className="mx-auto flex min-h-full w-full max-w-7xl flex-col px-gutter">
        <SiteHeader
          githubTitle={messages.githubTitle}
          openSource={messages.openSource}
          canHelp={messages.canHelp}
          homeHref={locale === "sl" ? "/" : "/en"}
        />

        <main className="flex flex-1 flex-col gap-section-gap py-page-y">
          <div className="space-y-1.5">
            <h1 className="text-xl font-medium tracking-tight sm:text-2xl md:text-3xl">
              {messages.heroTitle}
            </h1>
            {/* The hero's second line carries both things the page has to say
                about itself: what is in it, and the way out for someone who
                found an animal rather than wants one. They share the row from
                lg up, where there is width for it, and stack below that. A
                band of its own under the hero was a whole horizontal rule of
                page spent on the smaller of the two questions. */}
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between lg:gap-6">
              {dataset && shelters > 0 && (
                <p className="text-sm text-muted-foreground">
                  {shelterCount(shelters, locale)} · {messages.updated}{" "}
                  {new Date(dataset.generatedAt).toLocaleDateString(
                    locale === "sl" ? "sl-SI" : "en-GB",
                  )}
                </p>
              )}
              {municipalities.length > 0 && <FoundAnimalButton />}
            </div>
          </div>

          <AnimalGrid
            animals={animals}
            logos={getShelterLogos()}
            referenceDate={dataset?.generatedAt ?? new Date().toISOString()}
            municipalities={municipalities}
            offSiteShelters={offSiteShelters}
          />
        </main>

        <SiteFooter locale={locale} />
      </div>
    </I18nProvider>
  );
}
