import { ArrowLeft } from "lucide-react";
import { I18nProvider } from "@/components/i18n-provider";
import { PrintButton } from "@/components/poster/print-button";
import { SreckoPoster } from "@/components/poster/srecko-poster";
import type { Locale } from "@/lib/i18n";
import { SRECKO, SRECKO_PATHS } from "@/lib/srecko";

/**
 * Srečko's poster route on screen: a bar, and the sheet under it.
 *
 * PosterPage's page, with the dataset taken out of it. No site header, no
 * footer, no back-to-top, and the same two controls, because a printer's
 * viewfinder wants the same two things here as it does for an animal from the
 * register: back to the page this sheet was made from, and print.
 */
export function SreckoPosterPage({ locale }: { locale: Locale }) {
  return (
    <I18nProvider locale={locale}>
      {/* Named rather than styled away in print: the print block in poster.css
          hides .poster-chrome, and anything that is site furniture on this
          route wears that class. */}
      <div className="poster-chrome flex items-center justify-between gap-3 border-b px-gutter py-2">
        {/* His own name and not messages.allAnimals: the way back from a
            sheet is the page it was made from, and there is exactly one of
            those. */}
        <a
          href={SRECKO_PATHS[locale]}
          className="inline-flex items-center gap-1.5 rounded-ui text-sm text-muted-foreground underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring max-lg:tap-target"
        >
          <ArrowLeft className="size-4 shrink-0" aria-hidden />
          {SRECKO.name}
        </a>
        <PrintButton />
      </div>

      <div className="poster-stage">
        <SreckoPoster locale={locale} />
      </div>
    </I18nProvider>
  );
}
