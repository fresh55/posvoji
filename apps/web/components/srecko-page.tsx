import { Cat, ChevronDown, Eye, Printer } from "lucide-react";
import Image from "next/image";
import { I18nProvider } from "@/components/i18n-provider";
import { ModelCredit } from "@/components/model-credit";
import { PageBreadcrumb } from "@/components/page-breadcrumb";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { HEALTH_ICONS } from "@/lib/animal-icons";
import { EMPTY_FILTERS, serializeFilters } from "@/lib/filters";
import { getMessages, type Locale } from "@/lib/i18n";
import { homePath } from "@/lib/shelter-path";
import { ABOUT_PATHS } from "@/lib/site-links";
import { SRECKO, SRECKO_PATHS, SRECKO_POSTER_PATHS, SRECKO_TEXT, sreckoMilestones, sreckoPortrait, sreckoHomeDateRange } from "@/lib/srecko";

export function SreckoPage({ locale }: { locale: Locale }) {
  const text = SRECKO_TEXT[locale], portrait = sreckoPortrait();
  const milestones = sreckoMilestones(locale), homeRange = sreckoHomeDateRange(locale);
  const catsHref = `${homePath(locale)}?${serializeFilters({ ...EMPTY_FILTERS, species: "cat" })}`;
  const facts = [{ ...text.eye, Icon: Eye }, { ...text.felv, Icon: HEALTH_ICONS["brez-felv"] }];
  return (
    <I18nProvider locale={locale}>
      <div className="mx-auto flex min-h-dvh w-full max-w-7xl flex-col px-gutter">
        <SiteHeader homeHref={homePath(locale)} languagePaths={SRECKO_PATHS} />
        <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-7 py-page-y sm:gap-8">
          <div className="space-y-5">
            <PageBreadcrumb locale={locale} trail={[{ label: getMessages(locale).about, href: ABOUT_PATHS[locale] }]} current={SRECKO.name} />
            <header className="space-y-3">
              <h1 className="text-3xl font-medium tracking-tight sm:text-4xl">{SRECKO.name}</h1>
              <p className="text-lg font-medium">{text.memorial}</p>
              <p className="max-w-prose text-base leading-relaxed text-muted-foreground sm:text-lg">{text.intro}</p>
            </header>
            {SRECKO.memory && <p className="max-w-prose leading-relaxed">{SRECKO.memory[locale]}</p>}
            <Button asChild variant="outline" className="min-h-11">
              <a href={catsHref}><Cat aria-hidden />{text.cats}</a>
            </Button>
          </div>
          {SRECKO.photos.length > 0 ? (
            <ul className="grid gap-3 sm:grid-cols-2">
              {SRECKO.photos.map((photo, index) => (
                <li key={photo.src} className={index === 0 ? "sm:col-span-2" : ""}>
                  <Image src={photo.src} alt={photo.alt[locale]} width={photo.width} height={photo.height} loading={index === 0 ? "eager" : "lazy"}
                    sizes={index === 0 ? "(min-width: 800px) 768px, 100vw" : "(min-width: 640px) 384px, 100vw"}
                    className="h-auto w-full rounded-ui" />
                </li>
              ))}
            </ul>
          ) : (
            <div className="relative mx-auto h-64 w-full max-w-sm sm:h-80">
              <Image src={portrait.src} alt={portrait.alt[locale]} fill loading="eager" sizes="(min-width: 640px) 384px, 100vw" className="object-contain" />
            </div>
          )}
          <p className="max-w-prose text-base leading-relaxed">{text.purpose}</p>
          <details className="group border-y py-4">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-4">
              {text.facts}<ChevronDown aria-hidden className="size-4 group-open:rotate-180" />
            </summary>
            <dl className="space-y-5 pb-2 pt-4">
              {facts.map(({ title, body, Icon }) => (
                <div key={title} className="flex gap-3">
                  <Icon aria-hidden className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
                  <div><dt className="text-sm font-medium">{title}</dt><dd className="mt-1 text-sm leading-relaxed text-muted-foreground">{body}</dd></div>
                </div>
              ))}
            </dl>
          </details>
          {milestones.length > 0 && (
            <section aria-label={text.dates} className="space-y-3">
              <h2 className="text-base font-medium">{text.dates}</h2>
              <ol className="space-y-2 text-sm">
                {milestones.map(event => <li key={event.key} className="flex flex-wrap gap-x-3">
                  <span>{event.label}</span><time className="text-muted-foreground" dateTime={event.iso}>{event.date}</time>
                </li>)}
              </ol>
              {homeRange && <p className="text-sm text-muted-foreground">{text.home}: {homeRange}</p>}
            </section>
          )}
          <a href={SRECKO_POSTER_PATHS[locale]} className="inline-flex min-h-11 w-fit items-center gap-2 rounded-sm text-sm text-muted-foreground underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4">
            <Printer aria-hidden className="size-4" />{text.poster}
          </a>
          <p className="border-t pt-6 text-sm leading-relaxed text-muted-foreground">{text.dedication}</p>
        </main>
        <SiteFooter locale={locale}>{SRECKO.photos.length === 0 && <ModelCredit locale={locale} />}</SiteFooter>
      </div>
    </I18nProvider>
  );
}
