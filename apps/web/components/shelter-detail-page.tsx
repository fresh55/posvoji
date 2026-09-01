import { Globe, Info, Mail, MapPin, MapPinned, Phone } from "lucide-react";
import { notFound } from "next/navigation";
import { Fragment } from "react";
import { PageBreadcrumb } from "@/components/page-breadcrumb";
import { I18nProvider } from "@/components/i18n-provider";
import { JsonLd } from "@/components/json-ld";
import { ShelterAnimalGrid } from "@/components/shelter-animal-grid";
import { ShelterAvatar } from "@/components/shelter-avatar";
import { ShelterLocationMap } from "@/components/shelter-location-map";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { mailtoHref, telHref } from "@/lib/contact-links";
import { animalsForClient, loadDataset } from "@/lib/dataset";
import { shelterAnimalsPath } from "@/lib/filters";
import { getMessages, type Locale } from "@/lib/i18n";
import { animalCount, META_DOT_CLASS, registerDateLabel } from "@/lib/labels";
import { MUTED_LINK } from "@/lib/link-styles";
import {
  type CoveredMunicipality,
  shelterCoverage,
} from "@/lib/municipality-coverage";
import { shelterJsonLd } from "@/lib/shelter-jsonld";
import { sheltersIndexPath } from "@/lib/shelter-path";
import { getShelterLogos } from "@/lib/shelter-logos";
import { getShelterBySlug, shelterRegisterDate } from "@/lib/shelters";
import { cn } from "@/lib/utils";

const pageText = {
  sl: {
    website: "Spletna stran",
    animalsTitle: "Živali iz tega zavetišča",
    providerNotice:
      "Vsaka žival je povezana na izvirno objavo pri zavetišču.",
    registryNotice:
      "Zavetišče je navedeno iz javnega registra UVHVVR. Za zdaj še nima urejenega vira podatkov o živalih na Posvoji.si, zato tukaj ni seznama; za posvojitev se obrnite nanje neposredno.",
    mapLabel: "Lega zavetišča na zemljevidu Slovenije",
    openInSearch: "Odpri v iskalniku živali",
    source: "Vir: UVHVVR — register zavetišč (gov.si)",
    asOf: "stanje",
    coverageTitle: "Pokriva občine",
    coverageNote:
      "Po javno dostopnih podatkih je to zavetišče pristojno za zapuščene živali iz teh občin.",
    coverageShowAll: "Prikaži vse občine ({count})",
    coverageDogsOnly: "samo psi",
    coverageCatsOnly: "samo mačke",
    coverageSource: "Vir:",
    coverageDatedSource:
      "Del podatkov je iz starejših virov; pred obiskom preveri pri zavetišču ali občini.",
  },
  en: {
    website: "Website",
    animalsTitle: "Animals from this shelter",
    providerNotice:
      "Every animal links back to its original listing at the shelter.",
    registryNotice:
      "This shelter is listed from the public UVHVVR registry. It does not yet have a data feed on Posvoji.si, so there is no animal list here; contact the shelter directly to ask about adoption.",
    mapLabel: "The shelter's location on a map of Slovenia",
    openInSearch: "Open in the animal search",
    source: "Source: UVHVVR — shelter registry (gov.si)",
    asOf: "as of",
    coverageTitle: "Municipalities covered",
    coverageNote:
      "By publicly available data, this shelter is responsible for stray animals from these municipalities.",
    coverageShowAll: "Show all municipalities ({count})",
    coverageDogsOnly: "dogs only",
    coverageCatsOnly: "cats only",
    coverageSource: "Source:",
    coverageDatedSource:
      "Some of this comes from older sources; confirm with the shelter or municipality before visiting.",
  },
} satisfies Record<Locale, Record<string, string>>;

type PageText = (typeof pageText)[Locale];

/** How many municipality names stand in the open before the rest move behind
 *  a disclosure. The widest shelter in the registry covers 26 občin: a dozen
 *  chips still read as one fact about the shelter, the full list reads as a
 *  page of its own. */
const MUNICIPALITY_PREVIEW = 12;

// Names, not sentences. A municipality carries a species tag only where the
// registry limits the shelter to one species there, which is a difference
// someone standing over a found animal needs before they call.
function MunicipalityChips({
  municipalities,
  text,
}: {
  municipalities: CoveredMunicipality[];
  text: PageText;
}) {
  return (
    <ul className="flex flex-wrap gap-1.5">
      {municipalities.map((municipality) => (
        <li
          key={municipality.name}
          className="rounded-full border px-2.5 py-0.5 text-xs text-muted-foreground"
        >
          {municipality.name}
          {municipality.species && (
            <span className="ml-1 text-2xs">
              (
              {municipality.species === "dogs"
                ? text.coverageDogsOnly
                : text.coverageCatsOnly}
              )
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

export function ShelterDetailPage({
  locale,
  slug,
}: {
  locale: Locale;
  slug: string;
}) {
  const shelter = getShelterBySlug(slug);
  if (!shelter) notFound();

  const dataset = loadDataset();
  const animals = (dataset?.animals ?? []).filter(
    (animal) => animal.shelter.id === shelter.id,
  );
  const logos = getShelterLogos();
  const hasData = animals.length > 0;
  const text = pageText[locale];
  const messages = getMessages(locale);
  const indexHref = sheltersIndexPath(locale);
  const registerDate = shelterRegisterDate();
  const asOf = registerDate
    ? registerDateLabel(registerDate, locale)
    : undefined;
  // One groupBy over the municipality registry the found-animal lookup
  // already reads at build time, taken from the other end. Undefined when no
  // row names this shelter, and then nothing below renders.
  const coverage = shelterCoverage(shelter.id);
  const shownMunicipalities =
    coverage?.municipalities.slice(0, MUNICIPALITY_PREVIEW) ?? [];
  const restMunicipalities =
    coverage?.municipalities.slice(MUNICIPALITY_PREVIEW) ?? [];

  return (
    <I18nProvider locale={locale}>
      <div className="mx-auto flex min-h-dvh w-full max-w-7xl flex-col px-gutter">
        <SiteHeader
          homeHref={locale === "sl" ? "/" : "/en"}
          languagePaths={{
            sl: `/zavetisca/${shelter.id}`,
            en: `/en/shelters/${shelter.id}`,
          }}
        />

        <main className="flex w-full max-w-5xl flex-1 flex-col gap-8 py-page-y sm:gap-10">
          {/* This page is where the shelter's own facts live, so the machine
              readable copy of them belongs here rather than on the index. */}
          <JsonLd data={shelterJsonLd(shelter, locale)} />

          <div className="space-y-5">
            {/* The one page on the site that is two levels down, and the only
                one whose trail says something the header nav does not: this
                shelter belongs to the register, and the register belongs to
                the grid. The back link it replaced pointed at the index on a
                cold load and at the root on a warm one, so the control that
                expressed depth was the one that skipped a level. */}
            <PageBreadcrumb
              locale={locale}
              // messages.shelters, not a copy in this file's own pageText:
              // the index page labels the identical crumb from there, and two
              // sources for one word is the drift PageBreadcrumb exists to
              // end.
              trail={[{ label: messages.shelters, href: indexHref }]}
              current={shelter.name}
            />

            {/* The map beside the whole header stack, not beside the notice
                alone. Paired with just the notice it set the row's height:
                the drawing is 320 by 210, so any width that keeps it legible
                makes it taller than one or two lines of text, and the
                difference came out as a dead band under the notice. The
                hero, the contacts and the notice together are taller than
                the map at every width the register produces, so beside the
                stack it fills the empty right of the header and sets no
                height of its own. Below sm it follows the notice, where the
                single column puts it. */}
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-8">
              <div className="min-w-0 flex-1 space-y-5">
                <div className="flex flex-wrap items-center gap-4">
                  <ShelterAvatar
                    name={shelter.name}
                    logo={logos[shelter.id]}
                    size="lg"
                    // Green here only where the notice below it is also green.
                    // The hero and that notice are the one statement this page
                    // makes about the shelter's data, so they say it together or
                    // not at all.
                    accent={hasData}
                  />
                  {/* A floor under this column rather than min-w-0. The mark
                      beside it draws up to 170px wide (SIZE.lg in
                      shelter-avatar.tsx), which at a 320px viewport left this
                      column about 100px, and neither the name nor the town
                      line fits in that: the page scrolled sideways. With a
                      floor, the row's flex-wrap moves the whole column under
                      the mark instead of crushing it, and the column gets the
                      full width there. */}
                  <div className="min-w-40 flex-1 space-y-1">
                    {/* break-words is the last resort under it: a name whose
                        longest word is wider than the column breaks the word
                        rather than the page. */}
                    <h1 className="break-words text-2xl font-medium tracking-tight sm:text-3xl">
                      {shelter.name}
                    </h1>
                    {/* Wrapping, not truncation: the town and the count are
                        both facts someone came here for. The two spans keep
                        the pin with the town and the middot with the count, so
                        a break falls between the facts rather than inside
                        one. */}
                    <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm text-muted-foreground">
                      <span className="inline-flex min-w-0 items-center gap-1.5">
                        <MapPin className="size-3.5 shrink-0" aria-hidden />
                        <span className="break-words">{shelter.city}</span>
                      </span>
                      {/* The number someone arriving from a card most wants:
                          whether this shelter has more to show. Absent rather
                          than zero for a registry shelter, whose notice below
                          already explains why there is no list. */}
                      {hasData && (
                        <span className="inline-flex items-center gap-1.5">
                          <span className={META_DOT_CLASS}>·</span>
                          {animalCount(animals.length, locale)}
                        </span>
                      )}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {shelter.website && (
                    <Button asChild variant="outline" size="sm">
                      <a href={shelter.website} target="_blank" rel="noreferrer">
                        <Globe aria-hidden />
                        {text.website}
                      </a>
                    </Button>
                  )}
                  {shelter.email && (
                    <Button asChild variant="outline" size="sm">
                      <a href={mailtoHref(shelter.email)}>
                        <Mail aria-hidden />
                        {shelter.email}
                      </a>
                    </Button>
                  )}
                  {shelter.phone && (
                    <Button asChild variant="outline" size="sm">
                      <a href={telHref(shelter.phone)}>
                        <Phone aria-hidden />
                        {shelter.phone}
                      </a>
                    </Button>
                  )}
                </div>

                {/* The notice says what this page can offer: whether the animal
                    list below is the shelter's own, or why there is none. */}
                <div
                  className={cn(
                    "flex items-start gap-2.5 rounded-ui border px-4 py-3 text-sm leading-relaxed",
                    hasData
                      ? "border-[var(--filter-accent-border)] bg-[var(--filter-accent)] text-[var(--filter-accent-foreground)]"
                      : "bg-muted/40 text-muted-foreground",
                  )}
                >
                  <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <p>{hasData ? text.providerNotice : text.registryNotice}</p>
                </div>
              </div>
              <ShelterLocationMap
                city={shelter.city}
                label={`${text.mapLabel}: ${shelter.city}`}
                className="h-auto w-full max-w-[13rem] shrink-0"
              />
            </div>
          </div>

          {/* The one fact this page can carry that the register cannot: which
              občine this shelter answers for. It sits with the shelter's own
              facts, under the contacts someone came here to use and above the
              animal list, because it is about the shelter and not about the
              animals. */}
          {coverage && (
            <section className="space-y-3">
              <h2 className="flex items-center gap-2 text-base font-medium tracking-tight">
                <MapPinned
                  className="size-4 shrink-0 text-muted-foreground"
                  aria-hidden
                />
                {text.coverageTitle}
              </h2>
              <p className="text-sm text-muted-foreground">
                {text.coverageNote}
              </p>

              <MunicipalityChips
                municipalities={shownMunicipalities}
                text={text}
              />

              {/* A native disclosure: the full list is in the HTML either
                  way, it opens with JavaScript off, and the summary names the
                  total, so the cap is never silent. */}
              {restMunicipalities.length > 0 && (
                <details>
                  <summary className="cursor-pointer text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
                    {text.coverageShowAll.replace(
                      "{count}",
                      String(coverage.municipalities.length),
                    )}
                  </summary>
                  <div className="pt-3">
                    <MunicipalityChips
                      municipalities={restMunicipalities}
                      text={text}
                    />
                  </div>
                </details>
              )}

              {/* Cited here rather than in the line at the foot of the page:
                  this table has its own sources, separate from the register
                  the rest of the entry comes from. */}
              <p className="text-xs text-muted-foreground">
                {text.coverageSource}{" "}
                {coverage.sources.map((source, index) => (
                  <Fragment key={source.id}>
                    {index > 0 && ", "}
                    {source.url ? (
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noreferrer"
                        className="underline underline-offset-2 hover:text-foreground"
                      >
                        {source.label}
                      </a>
                    ) : (
                      source.label
                    )}{" "}
                    ({source.date})
                  </Fragment>
                ))}
                .{!coverage.confirmed && <> {text.coverageDatedSource}</>}
              </p>
            </section>
          )}

          {/* Only where there are animals to show. A registry shelter has no
              list at all, which the notice above already says; a heading over
              an empty grid said the same fact a second time and framed it as a
              list that happens to be empty this week. */}
          {hasData && (
            <section className="space-y-4">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2 border-b pb-3">
                <h2 className="text-xl font-medium tracking-tight sm:text-2xl">
                  {text.animalsTitle}
                </h2>
                {/* The grid here carries this shelter's animals and no filters.
                    The home grid reads the shelter off the address, so this
                    hands the same animals to the sex, age and size controls
                    that only live there. */}
                <a
                  href={shelterAnimalsPath(shelter.id, locale)}
                  className={MUTED_LINK}
                >
                  {text.openInSearch}
                </a>
              </div>
              <ShelterAnimalGrid
                // The same cards and the same dialog as the home page, so the
                // same projection: see animalsForClient in lib/dataset.ts.
                animals={animalsForClient(animals)}
                logos={logos}
                referenceDate={dataset?.generatedAt ?? new Date().toISOString()}
                basePath={`${indexHref}/${shelter.id}`}
              />
            </section>
          )}

          {/* Where this entry came from, on the page that is about this one
              shelter. The index says the same thing for the whole list. */}
          <p className="border-t pt-6 text-xs text-muted-foreground">
            {asOf ? `${text.source}, ${text.asOf} ${asOf}.` : `${text.source}.`}
          </p>
        </main>

        <SiteFooter locale={locale} />
      </div>
    </I18nProvider>
  );
}
