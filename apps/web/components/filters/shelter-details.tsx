"use client";

import Image from "next/image";
import { Hourglass } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { SPECIES_ICONS } from "@/lib/animal-icons";
import { thumbnailUrl } from "@/lib/animal-images";
import { speciesLabel } from "@/lib/labels";
import type { ShelterSummary } from "@/lib/shelter-summary";
import { cn } from "@/lib/utils";

// Fixed per position, not random, so one shelter's fan leans the same way on
// every render. PhotoSpread's own nudge is tuned for full-size photos and
// disappears at chip scale, so this one leans harder.
const FACE_TILT = [-5, 4, -6] as const;

// What one shelter is, beyond the name and the filtered count its row already
// carries: who lives there, a few of the faces waiting, and who has waited
// longest. It renders inside the collapsible that opens under that row, so it
// is content and nothing else: no name, no city, no check, no close control,
// because the row directly above it is all four of those and repeating them
// would make the panel read as a second, competing row.
//
// It carries no button at all. The dialog has one primary action, the confirm
// pill in the footer, and that pill is the only control that knows the real
// number: a second "show animals" next to one shelter's own count promised
// that shelter's animals and applied every filter in the dialog.
//
// Every breakpoint, deliberately. This used to be a floating card marked
// max-lg:hidden, because at the sheet's height the card filled the list
// scroller and pushed the rows it was introducing off the bottom. Inline in
// the list, the panel scrolls with the rows and costs the sheet nothing it
// cannot scroll past, so a phone gets shelter inspection for the first time.
export function ShelterDetails({
  summary,
  className,
}: {
  /** Species breakdown, faces and longest wait for the one shelter this panel
   *  belongs to. Absent while the picker is rendered without a dataset behind
   *  it (the map gallery, tests), and the panel then has nothing to say. */
  summary?: ShelterSummary;
  className?: string;
}) {
  const { locale, t } = useI18n();

  const species = summary?.species ?? [];
  const faces = summary?.faces ?? [];
  // Nothing to say is said by not being there. An empty panel opening under a
  // row would answer the info control with a blank strip, which reads as
  // broken rather than as "we know nothing about this shelter".
  if (species.length === 0 && faces.length === 0 && !summary?.longestWaiting) {
    return null;
  }

  return (
    <div data-shelter-details className={cn("space-y-2", className)}>
      {/* Who lives here, in the icons the species tabs and the result count
          already use. Every species the shelter has, whatever the species tab
          is set to: see summarizeShelters for why. */}
      {species.length > 0 && (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs tabular-nums">
          {species.map(({ species: kind, count }) => {
            const Icon = SPECIES_ICONS[kind];
            return (
              <span
                key={kind}
                data-pick-species={kind}
                className="inline-flex items-center gap-1"
                aria-label={`${speciesLabel(kind, locale)}: ${count}`}
              >
                <Icon className="size-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
                {count}
              </span>
            );
          })}
        </p>
      )}

      {/* A mini photo-spread: the same tilt-and-overlap language the animal
          dialog's gallery uses, at chip scale. The first face is whichever
          animal longestWaiting names, whenever that animal has a photo at all
          (see summarizeShelters), so this sits right above that line rather
          than anywhere else in the panel.

          The ring is drawn from the surface the fan sits on, so an overlap
          reads as a cut edge rather than as a mismatched halo. That surface is
          the expanded panel's bg-muted/30, which is translucent and so has no
          single token to name; color-mix composites the same colour the panel
          does, muted at 30% over the picker's own background. Both terms are
          redefined in the dark blocks, so this follows the theme without a
          second rule. Keep it in step with whatever fill the collapsible
          content carries in shelter-rows.tsx. */}
      {faces.length > 0 && (
        <div className="flex items-center">
          {faces.map((face, index) => (
            <span
              key={face.src}
              className={cn(
                "relative size-11 shrink-0 overflow-hidden rounded-ui bg-muted",
                "ring-2 ring-[color-mix(in_oklab,var(--muted)_30%,var(--background))]",
                index > 0 && "-ml-4",
              )}
              style={{
                zIndex: faces.length - index,
                transform: `rotate(${FACE_TILT[index % FACE_TILT.length]}deg)`,
              }}
            >
              <Image
                src={thumbnailUrl(face.src)}
                alt={face.name}
                fill
                sizes="3rem"
                className="object-cover"
              />
            </span>
          ))}
        </div>
      )}

      {/* The one animal a number cannot stand in for. Same hourglass and the
          same warm token the dialog gives a long wait, so the two marks are
          one mark. */}
      {summary?.longestWaiting && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Hourglass
            className="size-3.5 shrink-0 text-[var(--status-warn-mark)]"
            strokeWidth={1.75}
            aria-hidden
          />
          <span className="min-w-0 truncate">
            {t("longestWaiting", summary.longestWaiting)}
          </span>
        </p>
      )}
    </div>
  );
}
