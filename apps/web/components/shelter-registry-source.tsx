import type { Locale } from "@/lib/i18n";
import { registerDateLabel } from "@/lib/date-label";
import { MUTED_SENTENCE_LINK } from "@/lib/link-styles";
import { shelterRegisterDate, shelterRegisterIndexUrl } from "@/lib/shelters";
import { cn } from "@/lib/utils";

const text = {
  sl: {
    source: "Vir:",
    register: "register zavetišč UVHVVR (gov.si)",
    edition: "izdaja",
    supplement: "dopolnjeno s spletnimi stranmi zavetišč",
  },
  en: {
    source: "Source:",
    register: "UVHVVR shelter registry (gov.si)",
    edition: "edition",
    supplement: "supplemented with shelters’ websites",
  },
};

/** The directory and each shelter page cite the same registry edition.
 * Its publication date does not date the later website-sourced contacts. */
export function ShelterRegistrySource({ locale, className }: { locale: Locale; className?: string }) {
  const copy = text[locale];
  const date = shelterRegisterDate();
  const url = shelterRegisterIndexUrl();

  return (
    <p className={cn("text-xs text-muted-foreground", className)}>
      {copy.source}{" "}
      {url ? (
        <a href={url} className={MUTED_SENTENCE_LINK}>
          {copy.register}
        </a>
      ) : copy.register}
      {date && `, ${copy.edition} ${registerDateLabel(date, locale)}`}
      {`, ${copy.supplement}.`}
    </p>
  );
}
