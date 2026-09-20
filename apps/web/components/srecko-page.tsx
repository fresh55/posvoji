import { Cat, Printer } from "lucide-react";
import Image from "next/image";
import { ModelCredit } from "@/components/model-credit";
import { PageBreadcrumb } from "@/components/page-breadcrumb";
import { SiteFooter } from "@/components/site-footer";
import { SiteShell } from "@/components/site-shell";
import { Button } from "@/components/ui/button";
import { EMPTY_FILTERS, serializeFilters } from "@/lib/filters";
import { getMessages, type Locale } from "@/lib/i18n";
import { PAGE_TITLE } from "@/lib/link-styles";
import { homePath } from "@/lib/shelter-path";
import { ABOUT_PATHS } from "@/lib/site-links";
import {
  SRECKO,
  SRECKO_PATHS,
  SRECKO_POSTER_PATHS,
  SRECKO_TEXT,
  sreckoPortrait,
} from "@/lib/srecko";

export function SreckoPage({ locale }: { locale: Locale }) {
  const text = SRECKO_TEXT[locale];
  const portrait = sreckoPortrait();
  const hasPhotos = SRECKO.photos.length > 0;
  const catsHref = `${homePath(locale)}?${serializeFilters({ ...EMPTY_FILTERS, species: "cat" })}`;

  return (
    <SiteShell
      locale={locale}
      languagePaths={SRECKO_PATHS}
      mainClassName="mx-auto flex w-full max-w-xl flex-1 flex-col gap-section-gap py-page-y"
      footer={
        <SiteFooter locale={locale}>
          {!hasPhotos && <ModelCredit locale={locale} />}
        </SiteFooter>
      }
    >
      <div className="space-y-6">
        <PageBreadcrumb
          locale={locale}
          trail={[{ label: getMessages(locale).about, href: ABOUT_PATHS[locale] }]}
          current={SRECKO.name}
        />
        <header className="space-y-5">
          <div className="space-y-2">
            <h1 className={PAGE_TITLE}>{SRECKO.name}</h1>
            <p className="text-sm text-muted-foreground">{text.memorial}</p>
          </div>
          <div className="space-y-2 text-base leading-relaxed">
            <p>{text.posterStory}</p>
            {SRECKO.memory && <p>{SRECKO.memory[locale]}</p>}
          </div>
        </header>
      </div>

      {hasPhotos ? (
        <figure className="mx-auto w-full space-y-3" style={{ maxWidth: portrait.width }}>
          <ul className="grid grid-cols-3 gap-3">
            {SRECKO.photos.map((photo, index) => (
              <li key={photo.src} className={index === 0 ? "col-span-3" : ""}>
                <Image
                  src={photo.src}
                  alt={photo.alt[locale]}
                  width={photo.width}
                  height={photo.height}
                  loading={index === 0 ? "eager" : "lazy"}
                  sizes={index === 0
                    ? `(min-width: ${portrait.width}px) ${portrait.width}px, 100vw`
                    : `(min-width: ${portrait.width}px) ${Math.ceil(portrait.width / 3)}px, 33vw`}
                  className="h-auto w-full rounded-ui"
                />
              </li>
            ))}
          </ul>
          <figcaption className="text-xs text-muted-foreground">
            {text.photoCredit}
          </figcaption>
        </figure>
      ) : (
        <div className="relative mx-auto h-64 w-full max-w-sm sm:h-80">
          <Image
            src={portrait.src}
            alt={portrait.alt[locale]}
            fill
            loading="eager"
            sizes="(min-width: 640px) 384px, 100vw"
            className="object-contain"
          />
        </div>
      )}

      <div className="space-y-4 border-t pt-6">
        <p className="text-sm leading-relaxed text-muted-foreground">{text.purpose}</p>
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-6">
          <Button asChild variant="outline" size="wrap" className="min-h-11 max-w-full">
            <a href={catsHref}>
              <Cat aria-hidden />
              {text.cats}
            </a>
          </Button>
          <a
            href={SRECKO_POSTER_PATHS[locale]}
            className="inline-flex min-h-11 max-w-full items-center gap-2 rounded-ui text-sm text-muted-foreground underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4"
          >
            <Printer aria-hidden className="size-4 shrink-0" />
            {text.poster}
          </a>
        </div>
      </div>
    </SiteShell>
  );
}
