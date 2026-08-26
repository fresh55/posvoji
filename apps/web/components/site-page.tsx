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

/** "20. 8. 2026" in Slovenian, unchanged; "20 Aug 2026" in English. en-GB's
 *  own numeric default is 20/08/2026, which reads as a fraction on a page
 *  that otherwise spells no date in digits, so English asks for day + short
 *  month + year instead — the order en-GB already gets right on its own. */
export function formatDatasetDate(date: Date, locale: Locale): string {
  return locale === "sl"
    ? date.toLocaleDateString("sl-SI")
    : date.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
}

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
        <SiteHeader
          githubTitle={messages.githubTitle}
          openSource={messages.openSource}
          canHelp={messages.canHelp}
          homeHref={locale === "sl" ? "/" : "/en"}
        />

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
                  {formatDatasetDate(new Date(dataset.generatedAt), locale)}
                </p>
              )}
              {hasLookup && <FoundAnimalButton />}
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

        {/* The one page that floats the filter dock, so the one footer that
            has to duck under it. It is also the one page that already knows
            whether the coverage table has anything in it, so it answers for
            the found-animal link rather than taking the default. */}
        <SiteFooter locale={locale} showFoundAnimalLink={hasLookup} docked />
      </div>
    </I18nProvider>
  );
}
