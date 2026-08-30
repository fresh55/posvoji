import { FoundAnimalLookup } from "@/components/found-animal-lookup";
import { I18nProvider } from "@/components/i18n-provider";
import { PageBreadcrumb } from "@/components/page-breadcrumb";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { loadDataset } from "@/lib/dataset";
import { getMessages, type Locale } from "@/lib/i18n";
import { FOUND_ANIMAL_PATHS } from "@/lib/found-animal";
import { buildMunicipalityEntries } from "@/lib/municipality-coverage";

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
// The dialog stays. On the homepage it is still the richer way in (it has the
// map), and /?najdena keeps opening it; this page is the same lookup for
// everyone who arrives from outside.
//
// One h1 and the lookup, nothing between them. The finder explains itself in
// its own empty state (muniHint), so an intro paragraph here would be the
// explanatory subtitle this site does not write. The cost answer and the
// what-now steps live inside the finder too, below the search, in the order
// the visitor needs them.
export function FoundAnimalPage({ locale }: { locale: Locale }) {
  const dataset = loadDataset();
  const entries = buildMunicipalityEntries(locale, dataset?.animals ?? []);
  const messages = getMessages(locale);
  const homeHref = locale === "sl" ? "/" : "/en";

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

        <main className="flex w-full max-w-xl flex-1 flex-col gap-6 py-page-y">
          <div className="space-y-5">
            <PageBreadcrumb locale={locale} current={messages.muniTab} />
            <h1 className="text-balance text-xl font-medium tracking-tight sm:text-2xl md:text-3xl">
              {messages.muniPromptTitle}
            </h1>
          </div>

          <FoundAnimalLookup entries={entries} />
        </main>

        {/* The one footer that does not link to the found-animal page,
            because it is on it. */}
        <SiteFooter locale={locale} showFoundAnimalLink={false} />
      </div>
    </I18nProvider>
  );
}
