"use client";

import { useState } from "react";
import {
  ShelterCard,
  type ShelterCardData,
  type ShelterCardText,
} from "@/components/shelter-card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { Locale } from "@/lib/i18n";

type SheltersFilterText = {
  /** Names the control for a screen reader; nothing prints it. */
  label: string;
  all: string;
  withData: string;
  contactOnly: string;
};

type Mode = "all" | "data" | "contact";

// One grid, no sections. The registry is 17 shelters: sorted into regions it
// took nine headings and the gaps between them to organise five rows of cards,
// which is more page than the grouping saved, and a reader who wants a town
// reads the cards faster than a heading index. The city on each card is the
// geography this page needs.
//
// The page is a server component and the registry never changes between
// renders, so the only reason this side of the boundary exists is the filter's
// state. It takes a flat array rather than the registry entries: see
// ShelterCardData for what does and does not cross.
export function SheltersGrid({
  shelters,
  locale,
  card,
  filter,
  mixedRegistry,
}: {
  shelters: ShelterCardData[];
  locale: Locale;
  card: ShelterCardText;
  filter: SheltersFilterText;
  /** Whether the registry currently holds both kinds of shelter. Nothing on
   *  this page distinguishes them until it does: the filter would answer with
   *  an empty page on one of its options, and the contact-only line would
   *  print on every card in the grid. */
  mixedRegistry: boolean;
}) {
  const [mode, setMode] = useState<Mode>("all");

  const visible = shelters.filter(
    (shelter) => mode === "all" || (mode === "data") === (shelter.count > 0),
  );

  return (
    <div className="flex flex-col gap-6">
      {mixedRegistry && (
        <ToggleGroup
          type="single"
          value={mode}
          // Radix hands back "" when the pressed item is pressed again, and a
          // single-select filter with nothing selected shows nothing.
          onValueChange={(value) => {
            if (value) setMode(value as Mode);
          }}
          variant="outline"
          size="sm"
          aria-label={filter.label}
        >
          <ToggleGroupItem value="all" className="max-lg:h-11">
            {filter.all}
          </ToggleGroupItem>
          <ToggleGroupItem value="data" className="max-lg:h-11">
            {filter.withData}
          </ToggleGroupItem>
          <ToggleGroupItem value="contact" className="max-lg:h-11">
            {filter.contactOnly}
          </ToggleGroupItem>
        </ToggleGroup>
      )}

      <ul className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
        {visible.map((shelter) => (
          <ShelterCard
            key={shelter.id}
            shelter={shelter}
            locale={locale}
            text={card}
            showContactOnly={mixedRegistry}
          />
        ))}
      </ul>
    </div>
  );
}
