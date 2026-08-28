import { Info, MapPin, PawPrint, ShieldCheck } from "lucide-react";
import { ShelterAvatar } from "@/components/shelter-avatar";
import type { ShelterLogo } from "@/lib/shelter-logos";
import type { Locale } from "@/lib/i18n";
import { animalCount } from "@/lib/labels";
import type { ShelterRegistryEntry } from "@/lib/shelters";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";

export function ShelterCard({
  shelter,
  href,
  logo,
  count,
  locale,
  providerBadge,
  registryBadge,
  noAnimalsYet,
}: {
  shelter: ShelterRegistryEntry;
  href: string;
  logo: ShelterLogo | undefined;
  count: number;
  locale: Locale;
  providerBadge: string;
  registryBadge: string;
  noAnimalsYet: string;
}) {
  const hasAnimals = count > 0;

  return (
    <Card asChild>
      <a
        href={href}
        // min-w-0, or this card sets the width of the column it sits in. As a
        // grid item its automatic minimum size is its min-content width, and
        // `truncate` on the name below is white-space: nowrap, whose
        // min-content is the whole name however long it runs. So the track
        // grew to fit "Zavetišče za zapuščene živali Ljubljana" unbroken and
        // overflowed the page: measured on a 390px phone, a 358px grid
        // holding a 413px card, and the whole document scrolled sideways.
        // The truncation could not save it, because the box was never asked
        // to be narrow in the first place. AnimalCard is spared the same
        // thing by the overflow-hidden it carries for its photo.
        className="group flex min-w-0 flex-col gap-4 p-5 transition-colors hover:border-foreground/25 focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        <div className="flex items-center gap-3">
          <ShelterAvatar name={shelter.name} logo={logo} />
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
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-2xs font-medium",
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
    </Card>
  );
}
