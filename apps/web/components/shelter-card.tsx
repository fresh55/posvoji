import { Info, MapPin, PawPrint, ShieldCheck } from "lucide-react";
import { ShelterAvatar } from "@/components/shelter-avatar";
import type { Locale } from "@/lib/i18n";
import { animalCount } from "@/lib/labels";
import type { ShelterRegistryEntry } from "@/lib/shelters";
import { cn } from "@/lib/utils";

export function ShelterCard({
  shelter,
  href,
  hasLogo,
  count,
  locale,
  providerBadge,
  registryBadge,
  noAnimalsYet,
}: {
  shelter: ShelterRegistryEntry;
  href: string;
  hasLogo: boolean;
  count: number;
  locale: Locale;
  providerBadge: string;
  registryBadge: string;
  noAnimalsYet: string;
}) {
  const hasAnimals = count > 0;

  return (
    <a
      href={href}
      className="group flex flex-col gap-4 rounded-ui border bg-card p-5 shadow-xs transition-colors hover:border-foreground/25 focus-visible:outline-2 focus-visible:outline-offset-2"
    >
      <div className="flex items-center gap-3">
        <ShelterAvatar name={shelter.name} id={shelter.id} hasLogo={hasLogo} />
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-medium">{shelter.name}</h2>
          <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
            <MapPin className="size-3 shrink-0" aria-hidden />
            {shelter.city}
          </p>
        </div>
      </div>

      <div className="mt-auto flex flex-wrap items-center gap-2">
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
            hasAnimals
              ? "border-[var(--filter-accent-border)] bg-[var(--filter-accent)] text-[var(--filter-accent-foreground)]"
              : "border-border bg-muted/50 text-muted-foreground",
          )}
        >
          {hasAnimals ? (
            <ShieldCheck className="size-3" aria-hidden />
          ) : (
            <Info className="size-3" aria-hidden />
          )}
          {hasAnimals ? providerBadge : registryBadge}
        </span>
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <PawPrint className="size-3" aria-hidden />
          {hasAnimals ? animalCount(count, locale) : noAnimalsYet}
        </span>
      </div>
    </a>
  );
}
