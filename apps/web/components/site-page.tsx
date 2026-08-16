import { AnimalGrid } from "@/components/animal-grid";
import { I18nProvider } from "@/components/i18n-provider";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { loadDataset } from "@/lib/dataset";
import { getMessages, type Locale } from "@/lib/i18n";
import { shelterCount } from "@/lib/labels";

export function SitePage({ locale }: { locale: Locale }) {
  const dataset = loadDataset();
  const animals = dataset?.animals ?? [];
  const shelters = new Set(animals.map((animal) => animal.shelter.id)).size;
  const messages = getMessages(locale);

  return (
    <I18nProvider locale={locale}>
      <div className="mx-auto flex min-h-full w-full max-w-7xl flex-col px-gutter">
        <SiteHeader
          githubTitle={messages.githubTitle}
          openSource={messages.openSource}
          canHelp={messages.canHelp}
          homeHref={locale === "sl" ? "/" : "/en"}
        />

        <main className="flex flex-1 flex-col gap-rhythm py-rhythm">
          <div className="space-y-2">
            <h1 className="text-2xl font-medium tracking-tight sm:text-3xl">
              {messages.heroTitle}
            </h1>
            {dataset && shelters > 0 && (
              <p className="text-sm text-muted-foreground">
                {shelterCount(shelters, locale)} · {messages.updated}{" "}
                {new Date(dataset.generatedAt).toLocaleDateString(
                  locale === "sl" ? "sl-SI" : "en-GB",
                )}
              </p>
            )}
          </div>

          <AnimalGrid animals={animals} />
        </main>

        <SiteFooter locale={locale} />
      </div>
    </I18nProvider>
  );
}
