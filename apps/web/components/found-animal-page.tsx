import { FoundAnimalAtlas } from "@/components/found-animal-atlas";
import { I18nProvider } from "@/components/i18n-provider";
import { PageBreadcrumb } from "@/components/page-breadcrumb";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { loadDataset } from "@/lib/dataset";
import { cityAt } from "@/lib/geo";
import { getMessages, type Locale } from "@/lib/i18n";
import { FOUND_ANIMAL_PATHS } from "@/lib/found-animal";
import type { ShelterPin } from "@/lib/map-layout";
import { buildMunicipalityEntries } from "@/lib/municipality-coverage";
import { shelterCensus } from "@/lib/shelter-census";
import { loadShelters } from "@/lib/shelters";

// The found-animal flow as a page with a URL, which it never had. It lived
// only inside the homepage map dialog behind /?najdena -- a query parameter
// on a page whose title, description and OG card all say "adopt an animal".
// The person this flow exists for does not start from this site's homepage:
// they are standing over a stray, searching "našel sem psa kaj narediti" or
// the name of the nearest shelter, or reading a link someone pasted into a
// Facebook group. A dialog with no URL cannot be ranked for that search,
// cannot be linked from an občina's website in a form anyone would publish,
// and pastes into a group chat as an adoption ad. A route can.
//
// This page is the whole of the flow now. The dialog went back to picking
// shelters, and /?najdena lands here instead of opening it
// (found-animal-redirect.tsx), so the municipality websites that published
// that address keep working. The page used to be the finder alone, which was
// the smallest change that gave the flow a URL and left the map, the better
// half of the answer, behind in the dialog.
//
// One h1 and the atlas, nothing between them. The finder explains itself in
// its own empty state (muniHint), so an intro paragraph here would be the
// explanatory subtitle this site does not write. The cost answer and the
// what-now steps live inside the finder, under the search, before and after
// an občina is named: somebody standing over an injured animal needs "do not
// move it" before they know which municipality they are in.
export function FoundAnimalPage({ locale }: { locale: Locale }) {
  const dataset = loadDataset();
  const animals = dataset?.animals ?? [];
  const entries = buildMunicipalityEntries(locale, animals);
  const messages = getMessages(locale);
  const homeHref = locale === "sl" ? "/" : "/en";

  // Every registered shelter on the map, on the register's own names. The
  // dialog draws the ones with a list from the filter options and the rest
  // from the register; this page has no filter, so the register is the one
  // source for all seventeen and the count says which of them share a list.
  // A shelter whose town the atlas cannot place is left off, as the dialog
  // leaves it off: a marker roughly in the right place is worse than none.
  const shelters = loadShelters();
  const census = shelterCensus(shelters, animals);
  const pins: ShelterPin[] = shelters.flatMap((shelter) => {
    const at = cityAt(shelter.city);
    if (!at) return [];
    const count = census.byShelter.get(shelter.id) ?? 0;
    return [
      {
        value: shelter.id,
        label: shelter.name,
        city: shelter.city,
        at,
        count,
        ...(count === 0 ? { selectable: false } : {}),
      },
    ];
  });

  return (
    <I18nProvider locale={locale}>
      <div className="mx-auto flex min-h-dvh w-full max-w-7xl flex-col px-gutter">
        <SiteHeader
          homeHref={homeHref}
          languagePaths={{
            sl: FOUND_ANIMAL_PATHS.sl,
            en: FOUND_ANIMAL_PATHS.en,
          }}
        />

        {/* Full width, where the finder alone took max-w-xl: the map wants
            the room, and the finder keeps to its own 24rem column beside it
            at lg (see the atlas). */}
        <main className="flex w-full flex-1 flex-col gap-6 py-page-y">
          <div className="space-y-5">
            <PageBreadcrumb locale={locale} current={messages.muniTab} />
            <h1 className="text-balance text-xl font-medium tracking-tight sm:text-2xl md:text-3xl">
              {messages.muniPromptTitle}
            </h1>
          </div>

          <FoundAnimalAtlas entries={entries} pins={pins} />
        </main>

        {/* The one footer that does not link to the found-animal page,
            because it is on it. */}
        <SiteFooter locale={locale} showFoundAnimalLink={false} />
      </div>
    </I18nProvider>
  );
}
