import { AnimalGrid } from "@/components/animal-grid";
import { FoundAnimalButton } from "@/components/found-animal-button";
import { I18nProvider } from "@/components/i18n-provider";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { animalsForClient, loadDataset } from "@/lib/dataset";
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
  // Read once: the hero row and the footer both ask it, and they must not
  // drift into two different answers about whether the lookup exists.
  const hasLookup = municipalities.length > 0;

  return (
    <I18nProvider locale={locale}>
      <div className="mx-auto flex min-h-full w-full max-w-7xl flex-col px-gutter">
        <SiteHeader homeHref={locale === "sl" ? "/" : "/en"} />

        <main className="flex flex-1 flex-col gap-section-gap py-page-y">
          <div className="space-y-1.5">
            <h1 className="text-balance text-xl font-medium tracking-tight sm:text-2xl md:text-3xl">
              {messages.heroTitle}
            </h1>
            {/* One wrapping line at every width, where this used to be a text
                line with a full-width button stacked under it. It carries both
                things the page has to say about itself: what is in it, and the
                way out for someone who found an animal rather than wants one.
                The second of those spent a whole horizontal rule of page on
                the smaller of the two questions for as long as it was a block;
                now that it is a line too (found-animal-button.tsx), the two
                fit together and the hero is a heading and one line.

                Siblings with their own gates, and not one sentence. The meta
                line needs a dataset, the way out needs a coverage table, and
                folded into a single paragraph the found-animal link would have
                disappeared every time the freshness line did. Only the
                separator needs both, so it is the only part that asks for
                both.

                flex-wrap, and the link renders in foreground ink with a
                standing underline while the meta line stays muted. Sharing one
                grey row, the link read as a second line of metadata on the
                375px wrap -- and the person it exists for is scanning the top
                of the page for something to act on, not reading captions. The
                voice difference separates them better than the middot that
                used to sit here and dangled at the wrap. */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
              {dataset && shelters > 0 && (
                <p>
                  {shelterCount(shelters, locale)} · {messages.updated}{" "}
                  {new Date(dataset.generatedAt).toLocaleDateString(
                    locale === "sl" ? "sl-SI" : "en-GB",
                  )}
                </p>
              )}
              {hasLookup && <FoundAnimalButton />}
            </div>
          </div>

          <AnimalGrid
            // Everything above this line is counted on the server and stays
            // here; the grid is a client component, so what it is given is
            // what ends up in the page's flight payload.
            animals={animalsForClient(animals)}
            logos={getShelterLogos()}
            referenceDate={dataset?.generatedAt ?? new Date().toISOString()}
            municipalities={municipalities}
            offSiteShelters={offSiteShelters}
          />
        </main>

        {/* The one page that floats the filter dock, so the one footer that
            has to duck under it. It is also the one page that already knows
            whether the coverage table has anything in it, so it answers for
            the found-animal link rather than taking the default. */}
        <SiteFooter locale={locale} showFoundAnimalLink={hasLookup} docked />
      </div>
    </I18nProvider>
  );
}
