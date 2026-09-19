import type { Locale } from "@/lib/i18n";
import { QUIET_DOC_LINK } from "@/lib/link-styles";
import {
  SRECKO_PATHS,
  SRECKO_TEXT,
} from "@/lib/srecko";
import { cn } from "@/lib/utils";

export function SreckoLink({ locale, className }: {
  locale: Locale;
  className?: string;
}) {
  return (
    <a
      href={SRECKO_PATHS[locale]}
      className={cn(QUIET_DOC_LINK, className)}
    >
      {SRECKO_TEXT[locale].story}
    </a>
  );
}
