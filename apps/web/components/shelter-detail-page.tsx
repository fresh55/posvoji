import { Globe, Info, Mail, MapPin, Phone, ShieldCheck } from "lucide-react";
import { notFound } from "next/navigation";
import { BackLink } from "@/components/back-link";
import { I18nProvider } from "@/components/i18n-provider";
import { DETAIL_TITLE_CLASS, PageShell } from "@/components/page-shell";
import { ShelterAnimalGrid } from "@/components/shelter-animal-grid";
import { ShelterAvatar } from "@/components/shelter-avatar";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { loadDataset } from "@/lib/dataset";
import type { Locale } from "@/lib/i18n";
import { animalCount, META_DOT_CLASS } from "@/lib/labels";
import { getShelterLogos } from "@/lib/shelter-logos";
import { getShelterBySlug } from "@/lib/shelters";
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
  },
} satisfies Record<Locale, Record<string, string>>;

function telHref(phone: string): string {
  return `tel:${phone.replace(/\s+/g, "")}`;
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
  const indexHref = locale === "sl" ? "/zavetisca" : "/en/shelters";

  return (
    <I18nProvider locale={locale}>
      <PageShell>
        <SiteHeader
          locale={locale}
          homeHref={locale === "sl" ? "/" : "/en"}
          languagePaths={{
            sl: `/zavetisca/${shelter.id}`,
            en: `/en/shelters/${shelter.id}`,
          }}
        />

        <main className="flex flex-1 flex-col gap-8 py-page-y sm:gap-10">
          <div className="space-y-5">
            <BackLink
              href={indexHref}
              label={text.back}
              className="inline-flex max-lg:tap-target text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            />

            <div className="flex flex-wrap items-center gap-4">
              <ShelterAvatar
                name={shelter.name}
                logo={logos[shelter.id]}
                size="lg"
              />
              <div className="min-w-0 flex-1 space-y-1">
                <h1 className={DETAIL_TITLE_CLASS}>{shelter.name}</h1>
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
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="max-lg:tap-target"
                >
                  <a href={shelter.website} target="_blank" rel="noreferrer">
                    <Globe aria-hidden />
                    {text.website}
                  </a>
                </Button>
              )}
              {shelter.email && (
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="max-lg:tap-target"
                >
                  <a href={`mailto:${shelter.email}`}>
                    <Mail aria-hidden />
                    {shelter.email}
                  </a>
                </Button>
              )}
              {shelter.phone && (
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="max-lg:tap-target"
                >
                  <a href={telHref(shelter.phone)}>
                    <Phone aria-hidden />
                    {shelter.phone}
                  </a>
                </Button>
              )}
            </div>

            {/* The box runs the width of the column it sits in. Capped at
                max-w-3xl inside a max-w-5xl main it was a bordered panel
                stopping 200px short of everything above and below it, which
                reads as a layout fault rather than as a measure. The cap
                belongs on the sentence, not on the frame around it.
                Trust green and not the selection green: this states a fact
                about the shelter, and nobody chose it. */}
            <div
              className={cn(
                "flex items-start gap-2.5 rounded-ui border px-4 py-3 text-sm leading-relaxed",
                hasData
                  ? "border-[var(--trust-border)] bg-[var(--trust)] text-[var(--trust-foreground)]"
                  : "bg-muted/40 text-muted-foreground",
              )}
            >
              {hasData ? (
                <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
              ) : (
                <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
              )}
              <p className="max-w-3xl">
                {hasData ? text.providerNotice : text.registryNotice}
              </p>
            </div>
          </div>

          <section className="space-y-4">
            <h2 className="border-b pb-3 text-xl font-medium tracking-tight sm:text-2xl">
              {text.animalsTitle}
            </h2>
            <ShelterAnimalGrid
              animals={animals}
              logos={logos}
              emptyLabel={text.emptyAnimals}
              referenceDate={dataset?.generatedAt ?? new Date().toISOString()}
              basePath={`${indexHref}/${shelter.id}`}
            />
          </section>
        </main>

        <SiteFooter locale={locale} />
      </PageShell>
    </I18nProvider>
  );
}
