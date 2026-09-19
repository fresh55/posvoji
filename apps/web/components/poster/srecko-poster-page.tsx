import { ArrowLeft } from "lucide-react";
import { I18nProvider } from "@/components/i18n-provider";
import { PrintButton } from "@/components/poster/print-button";
import { SreckoPoster } from "@/components/poster/srecko-poster";
import type { Locale } from "@/lib/i18n";
import {
  SRECKO,
  SRECKO_PATHS,
} from "@/lib/srecko";

export function SreckoPosterPage({ locale }: { locale: Locale }) {
  return (
    <I18nProvider locale={locale}>
      <div className="poster-chrome flex items-center justify-between gap-3 border-b px-gutter py-2">
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
