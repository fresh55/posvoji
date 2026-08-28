import { I18nProvider } from "@/components/i18n-provider";
import { ShelterCard } from "@/components/shelter-card";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { loadDataset } from "@/lib/dataset";
import type { Locale } from "@/lib/i18n";
import { shelterCount } from "@/lib/labels";
import { getShelterLogos } from "@/lib/shelter-logos";
import { loadShelters } from "@/lib/shelters";

const pageText = {
  sl: {
    title: "Zavetišča po Sloveniji",
    back: "Živali za posvojitev",
    providerBadge: "Deli podatke z dovoljenjem",
    registryBadge: "Le kontaktni podatki",
    noAnimalsYet: "brez živali za zdaj",
    registrySource: "Vir registra: UVHVVR (gov.si).",
  },
  en: {
    title: "Shelters across Slovenia",
    back: "Animals for adoption",
    providerBadge: "Shares data with permission",
    registryBadge: "Contact details only",
    noAnimalsYet: "no animals yet",
    registrySource: "Registry source: UVHVVR (gov.si).",
  },
} satisfies Record<Locale, Record<string, string>>;

export function SheltersPage({ locale }: { locale: Locale }) {
  const shelters = loadShelters();
  const dataset = loadDataset();
  const animals = dataset?.animals ?? [];
  const logos = getShelterLogos();
  const text = pageText[locale];
  const homeHref = locale === "sl" ? "/" : "/en";
  const detailBase = locale === "sl" ? "/zavetisca" : "/en/shelters";

  const counts = new Map<string, number>();
  for (const animal of animals) {
    counts.set(animal.shelter.id, (counts.get(animal.shelter.id) ?? 0) + 1);
  }
  const withData = shelters.filter((shelter) => (counts.get(shelter.id) ?? 0) > 0)
    .length;

  const sorted = [...shelters].sort((a, b) =>
    a.name.localeCompare(b.name, locale === "sl" ? "sl" : "en"),
  );

  const intro =
    locale === "sl"
      ? `${shelterCount(shelters.length, locale)} iz javnega registra UVHVVR. ${shelterCount(withData, locale)} trenutno deli strukturiran seznam živali z dovoljenjem; za ostala so na voljo kontaktni podatki.`
      : `${shelterCount(shelters.length, locale)} from the public UVHVVR registry. ${shelterCount(withData, locale)} currently share a structured animal list by permission; the rest list contact details only.`;

  return (
    <I18nProvider locale={locale}>
      <div className="mx-auto flex min-h-full w-full max-w-7xl flex-col px-gutter">
        <SiteHeader
          homeHref={homeHref}
          languagePaths={{ sl: "/zavetisca", en: "/en/shelters" }}
        />

        <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-10 py-page-y sm:gap-14">
          <div className="space-y-5">
            <a
              href={homeHref}
              className="inline-flex max-lg:tap-target text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              ← {text.back}
            </a>
            <div className="max-w-3xl space-y-3">
              <h1 className="text-3xl font-medium tracking-tight sm:text-4xl">
                {text.title}
              </h1>
              <p className="text-base leading-relaxed text-muted-foreground sm:text-lg">
                {intro}
              </p>
            </div>
            <p className="max-w-3xl text-xs text-muted-foreground">
              {text.registrySource}
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sorted.map((shelter) => (
              <ShelterCard
                key={shelter.id}
                shelter={shelter}
                href={`${detailBase}/${shelter.id}`}
                logo={logos[shelter.id]}
                count={counts.get(shelter.id) ?? 0}
                locale={locale}
                providerBadge={text.providerBadge}
                registryBadge={text.registryBadge}
                noAnimalsYet={text.noAnimalsYet}
              />
            ))}
          </div>
        </main>

        <SiteFooter locale={locale} showSheltersLink={false} />
      </div>
    </I18nProvider>
  );
}
