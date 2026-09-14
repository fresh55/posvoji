import type { Locale } from "@/lib/i18n";
import { MUTED_LINK } from "@/lib/link-styles";
import { SRECKO_PATHS, SRECKO_TEXT } from "@/lib/srecko";
import { cn } from "@/lib/utils";

/** The one link the cat gets wherever he is shown: to his page, in two words. */
export function SreckoLink({ locale, className }: { locale: Locale; className?: string }) {
  return (
    <a
      href={SRECKO_PATHS[locale]}
      className={cn(MUTED_LINK, "rounded-sm underline focus-visible:outline-2 focus-visible:outline-offset-4", className)}
    >
      {SRECKO_TEXT[locale].story}
    </a>
  );
}
