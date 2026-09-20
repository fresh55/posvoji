import { FoundAnimalAtlas } from "@/components/found-animal-atlas";
import { PageBreadcrumb } from "@/components/page-breadcrumb";
import { SiteFooter } from "@/components/site-footer";
import { SiteShell } from "@/components/site-shell";
import { loadDataset } from "@/lib/dataset";
import { toPins } from "@/components/filters/location-picker/model";
import { cityAt } from "@/lib/geo";
import { getMessages, type Locale } from "@/lib/i18n";
import { FOUND_ANIMAL_PATHS } from "@/lib/found-animal";
import { buildMunicipalityEntries } from "@/lib/municipality-coverage";
import { shelterCensus } from "@/lib/shelter-census";
import { loadShelters } from "@/lib/shelters";
import { sheltersIndexPath } from "@/lib/shelter-path";
import { PAGE_LEAD, PAGE_TITLE, SOURCE_LINK } from "@/lib/link-styles";

export function FoundAnimalPage({ locale }: { locale: Locale }) {
  const dataset = loadDataset();
  const animals = dataset?.animals ?? [];
  const entries = buildMunicipalityEntries(locale, animals);
  const messages = getMessages(locale);

  // Include registered shelters even without listings. toPins omits shelters
  // whose towns cannot be located rather than estimating their positions.
  const shelters = loadShelters();
  const census = shelterCensus(shelters, animals);
  const pins = toPins(
    shelters.map((shelter) => ({
      value: shelter.id,
      label: shelter.name,
      city: shelter.city,
      at: cityAt(shelter.city),
    })),
    (row) => {
      const count = census.byShelter.get(row.value) ?? 0;
      return count > 0 ? { count } : { count, selectable: false };
    },
  );

  return (
    <SiteShell
      locale={locale}
      languagePaths={FOUND_ANIMAL_PATHS}
      mainClassName="flex w-full flex-1 flex-col gap-section-gap py-page-y"
      // Omit the listings' export date: it does not date the coverage records.
      footer={
        <SiteFooter
          locale={locale}
          showFoundAnimalLink={false}
          aboutListings={false}
        />
      }
    >
      <div className="space-y-5">
        <PageBreadcrumb locale={locale} current={messages.muniTab} />
        {/* The shared title and lead, where this page used to print 20px
            over a 14px lead: the one short-title page that stepped down
            twice from what every other page's title says. The home page
            keeps its own smaller pair, because its h1 is a sentence. */}
        <h1 className={`text-balance ${PAGE_TITLE}`}>
          {messages.muniPromptTitle}
        </h1>
        <p className={`max-w-2xl text-pretty ${PAGE_LEAD}`}>
          {messages.muniIntro}
        </p>
      </div>

      <noscript>
        <p className="max-w-2xl rounded-ui border p-4 text-sm leading-relaxed">
          {messages.muniNoScript}{" "}
          <a href={sheltersIndexPath(locale)} className={`${SOURCE_LINK} underline`}>
            {messages.shelters}
          </a>
        </p>
      </noscript>
      <FoundAnimalAtlas entries={entries} pins={pins} />
    </SiteShell>
  );
}
