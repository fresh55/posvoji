import { Info, MapPin, PawPrint, ShieldCheck } from "lucide-react";
import { ShelterAvatar } from "@/components/shelter-avatar";
import type { ShelterLogo } from "@/lib/shelter-logos";
import type { Locale } from "@/lib/i18n";
import { animalCount } from "@/lib/labels";
import type { ShelterRegistryEntry } from "@/lib/shelters";
import { Badge } from "@/components/ui/badge";
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
      {/* min-w-0, because a grid item's default min-width is its content and
          the longest shelter name in the registry is wider than a 390px
          screen. Without it the name refused to wrap and pushed the column
          out from the inside. */}
      <a
        href={href}
        className="group flex min-w-0 flex-col gap-4 p-5 transition-colors hover:border-foreground/25 focus-ring"
      >
        <div className="flex items-center gap-3">
          <ShelterAvatar name={shelter.name} logo={logo} />
          <div className="min-w-0 flex-1">
            {/* line-clamp-2 and not truncate. The logo chip beside it is a
                fixed width now, so every name in the grid starts at the same
                x; what a name still needs is somewhere to go when it is long,
                and four of the seventeen were being cut mid-word on the one
                line truncate allowed them. */}
            <h2 className="line-clamp-2 font-medium">{shelter.name}</h2>
            <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
              <MapPin className="size-3 shrink-0" aria-hidden />
              {shelter.city}
            </p>
          </div>
        </div>

        <div className="mt-auto flex flex-wrap items-center gap-2">
          {/* Whether the shelter shares its animals is a fact about the
              shelter, so it wears the trust green rather than the selection
              green a sidebar card wears; a registry-only entry is neutral,
              not a warning. */}
          <Badge variant={hasAnimals ? "trust" : "quiet"}>
            {hasAnimals ? (
              <ShieldCheck aria-hidden />
            ) : (
              <Info aria-hidden />
            )}
            {hasAnimals ? providerBadge : registryBadge}
          </Badge>
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <PawPrint className="size-3" aria-hidden />
            {hasAnimals ? animalCount(count, locale) : noAnimalsYet}
          </span>
        </div>
      </a>
    </Card>
  );
}
