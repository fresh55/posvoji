"use client";

import { choiceCard } from "@/components/portal/portal-fields";
import { portalText } from "@/components/portal/portal-text";
import type { PortalShelter } from "@/lib/portal-api";

/**
 * Only rendered for an account that belongs to more than one shelter. A
 * single shelter needs no choice and goes straight to its animals.
 */
export function ShelterSwitcher({
  shelters,
  active,
  onSelect,
}: {
  shelters: PortalShelter[];
  active: string | null;
  onSelect: (slug: string) => void;
}) {
  return (
    <section className="space-y-2">
      <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {portalText.chooseShelter}
      </h2>
      <div className="flex flex-wrap gap-1.5">
        {shelters.map((shelter) => {
          const selected = shelter.slug === active;
          return (
            <button
              key={shelter.slug}
              type="button"
              aria-pressed={selected}
              onClick={() => onSelect(shelter.slug)}
              className={choiceCard(
                selected,
                "h-11 gap-2 px-2.5 text-sm font-medium",
              )}
            >
              <span
                aria-hidden
                className="grid size-6 shrink-0 place-items-center rounded-sm border border-current/25 text-[11px]"
              >
                {shelter.name.slice(0, 1).toUpperCase()}
              </span>
              <span className="truncate">{shelter.name}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
