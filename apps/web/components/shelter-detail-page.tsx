import { Globe, Info, Mail, MapPin, Phone, ShieldCheck } from "lucide-react";
import { notFound } from "next/navigation";
import { I18nProvider } from "@/components/i18n-provider";
import { ShelterAnimalGrid } from "@/components/shelter-animal-grid";
import { ShelterAvatar } from "@/components/shelter-avatar";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { loadDataset } from "@/lib/dataset";
import { getMessages, type Locale } from "@/lib/i18n";
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
  const messages = getMessages(locale);
  const text = pageText[locale];
  const indexHref = locale === "sl" ? "/zavetisca" : "/en/shelters";

  return (
    <I18nProvider locale={locale}>
      <div className="mx-auto flex min-h-full w-full max-w-7xl flex-col px-gutter">
        <SiteHeader
          githubTitle={messages.githubTitle}
          openSource={messages.openSource}
          canHelp={messages.canHelp}
          homeHref={locale === "sl" ? "/" : "/en"}
          languagePaths={{
            sl: `/zavetisca/${shelter.id}`,
            en: `/en/shelters/${shelter.id}`,
          }}
        />

        <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 py-page-y sm:gap-10">
          <div className="space-y-5">
            <a
              href={indexHref}
              className="inline-flex text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              ← {text.back}
            </a>

            <div className="flex flex-wrap items-center gap-4">
              <ShelterAvatar
                name={shelter.name}
                logo={logos[shelter.id]}
                size="lg"
              />
              <div className="min-w-0 flex-1 space-y-1">
                <h1 className="text-2xl font-medium tracking-tight sm:text-3xl">
                  {shelter.name}
                </h1>
                <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <MapPin className="size-3.5 shrink-0" aria-hidden />
                  {shelter.city}
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
                  <a href={`mailto:${shelter.email}`}>
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

            <div
              className={cn(
                "flex max-w-3xl items-start gap-2.5 rounded-ui border px-4 py-3 text-sm leading-relaxed",
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
      </div>
    </I18nProvider>
  );
}
