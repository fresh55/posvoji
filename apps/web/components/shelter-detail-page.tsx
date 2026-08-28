import { Globe, Info, Mail, MapPin, Phone, ShieldCheck } from "lucide-react";
import { notFound } from "next/navigation";
import { BackLink } from "@/components/back-link";
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
import type { Locale } from "@/lib/i18n";
import { animalCount, META_DOT_CLASS, registerDateLabel } from "@/lib/labels";
import { MUTED_LINK } from "@/lib/link-styles";
import { shelterJsonLd } from "@/lib/shelter-jsonld";
import { sheltersIndexPath } from "@/lib/shelter-path";
import { getShelterLogos } from "@/lib/shelter-logos";
import { getShelterBySlug, shelterRegisterDate } from "@/lib/shelters";
import { cn } from "@/lib/utils";

const pageText = {
  sl: {
    back: "Zavetišča",
    website: "Spletna stran",
    animalsTitle: "Živali iz tega zavetišča",
    emptyAnimals: "Trenutno ni objavljenih živali iz tega zavetišča.",
    providerNotice:
      "To zavetišče podatke o živalih deli z izrecnim dovoljenjem. Vsaka žival je povezana na izvirno objavo pri zavetišču.",
    registryNotice:
      "Zavetišče je navedeno iz javnega registra UVHVVR. Za zdaj še nima urejenega vira podatkov o živalih na Posvoji.si, zato tukaj ni seznama; za posvojitev se obrnite nanje neposredno.",
    mapLabel: "Lega zavetišča na zemljevidu Slovenije",
    openInSearch: "Odpri v iskalniku živali",
    source: "Vir: UVHVVR — register zavetišč (gov.si)",
    asOf: "stanje",
  },
  en: {
    back: "Shelters",
    website: "Website",
    animalsTitle: "Animals from this shelter",
    emptyAnimals: "No animals from this shelter are published yet.",
    providerNotice:
      "This shelter shares animal data with explicit permission. Every animal links back to its original listing at the shelter.",
    registryNotice:
      "This shelter is listed from the public UVHVVR registry. It does not yet have a data feed on Posvoji.si, so there is no animal list here; contact the shelter directly to ask about adoption.",
    mapLabel: "The shelter's location on a map of Slovenia",
    openInSearch: "Open in the animal search",
    source: "Source: UVHVVR — shelter registry (gov.si)",
    asOf: "as of",
  },
} satisfies Record<Locale, Record<string, string>>;

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
  const indexHref = sheltersIndexPath(locale);
  const registerDate = shelterRegisterDate();
  const asOf = registerDate
    ? registerDateLabel(registerDate, locale)
    : undefined;

  return (
    <I18nProvider locale={locale}>
      <div className="mx-auto flex min-h-full w-full max-w-7xl flex-col px-gutter">
        <SiteHeader
          homeHref={locale === "sl" ? "/" : "/en"}
          languagePaths={{
            sl: `/zavetisca/${shelter.id}`,
            en: `/en/shelters/${shelter.id}`,
          }}
        />

        <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 py-page-y sm:gap-10">
          {/* This page is where the shelter's own facts live, so the machine
              readable copy of them belongs here rather than on the index. */}
          <JsonLd data={shelterJsonLd(shelter, locale)} />

          <div className="space-y-5">
            <BackLink href={indexHref} label={text.back} />

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
              <div className="min-w-0 flex-1 space-y-1">
                <h1 className="text-2xl font-medium tracking-tight sm:text-3xl">
                  {shelter.name}
                </h1>
                <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <MapPin className="size-3.5 shrink-0" aria-hidden />
                  {shelter.city}
                  {/* The number someone arriving from a card most wants:
                      whether this shelter has more to show. Absent rather
                      than zero for a registry shelter, whose notice below
                      already explains why there is no list. */}
                  {hasData && (
                    <>
                      <span className={META_DOT_CLASS}>·</span>
                      {animalCount(animals.length, locale)}
                    </>
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

            {/* The notice says what this page can offer; the map says where
                the shelter is, which is the one thing the index card cannot
                carry. Side by side above sm, because each is short and the
                notice alone left the right half of the page empty. */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-6">
              <div
                className={cn(
                  "flex flex-1 items-start gap-2.5 rounded-ui border px-4 py-3 text-sm leading-relaxed",
                  hasData
                    ? "border-[var(--filter-accent-border)] bg-[var(--filter-accent)] text-[var(--filter-accent-foreground)]"
                    : "bg-muted/40 text-muted-foreground",
                )}
              >
                {hasData ? (
                  <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
                ) : (
                  <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
                )}
                <p>{hasData ? text.providerNotice : text.registryNotice}</p>
              </div>
              <ShelterLocationMap
                city={shelter.city}
                label={`${text.mapLabel}: ${shelter.city}`}
                className="h-auto w-full max-w-[13rem] shrink-0"
              />
            </div>
          </div>

          <section className="space-y-4">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2 border-b pb-3">
              <h2 className="text-xl font-medium tracking-tight sm:text-2xl">
                {text.animalsTitle}
              </h2>
              {/* The grid here carries this shelter's animals and no filters.
                  The home grid reads the shelter off the address, so this hands
                  the same animals to the sex, age and size controls that only
                  live there. */}
              {hasData && (
                <a
                  href={shelterAnimalsPath(shelter.id, locale)}
                  className={MUTED_LINK}
                >
                  {text.openInSearch}
                </a>
              )}
            </div>
            <ShelterAnimalGrid
              // The same cards and the same dialog as the home page, so the
              // same projection: see animalsForClient in lib/dataset.ts.
              animals={animalsForClient(animals)}
              logos={logos}
              emptyLabel={text.emptyAnimals}
              referenceDate={dataset?.generatedAt ?? new Date().toISOString()}
              basePath={`${indexHref}/${shelter.id}`}
            />
          </section>

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
