"use client";

import Image from "next/image";
import { Hourglass } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { SPECIES_ICONS } from "@/lib/animal-icons";
import { thumbnailUrl } from "@/lib/animal-images";
import { speciesLabel } from "@/lib/labels";
import type { ShelterSummary } from "@/lib/shelter-summary";
import { cn } from "@/lib/utils";

const DETAIL_LABELS = {
  sl: {
    matching: "Ustreza filtrom",
    allPublished: "Vse objavljene živali",
    previews: "Primeri iz vseh objav",
  },
  en: {
    matching: "Matching your filters",
    allPublished: "All published animals",
    previews: "Examples from all listings",
  },
} as const;

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
  matchingCount,
  className,
}: {
  /** Species breakdown, faces and longest wait for the one shelter this panel
   *  belongs to. Absent while the picker is rendered without a dataset behind
   *  it (the map gallery, tests), and the panel then has nothing to say. */
  summary?: ShelterSummary;
  /** The row's count under the current filters. The summary remains the
   *  complete shelter overview, so each number needs its own visible scope. */
  matchingCount?: number;
  className?: string;
}) {
  const { locale, t } = useI18n();
  const labels = DETAIL_LABELS[locale];

  const species = summary?.species ?? [];
  const faces = summary?.faces ?? [];
  // Nothing to say is said by not being there. An empty panel opening under a
  // row would answer the info control with a blank strip, which reads as
  // broken rather than as "we know nothing about this shelter".
  if (species.length === 0 && faces.length === 0 && !summary?.longestWaiting) {
    return null;
  }

  return (
    <div data-shelter-details className={cn("space-y-3", className)}>
      {matchingCount !== undefined && (
        <p className="text-sm font-medium tabular-nums">
          {labels.matching}: {matchingCount}
        </p>
      )}
      <div
        role="group"
        aria-label={labels.allPublished}
        className={cn(
          "space-y-3",
          matchingCount !== undefined && "border-t border-border/60 pt-3",
        )}
      >
        <p className="text-xs font-medium text-muted-foreground tabular-nums">
          {labels.allPublished}
          {species.length > 0 &&
            `: ${species.reduce((total, item) => total + item.count, 0)}`}
        </p>
        {/* Who lives here, in the icons the species tabs and the result count
            already use. Every species the shelter has, whatever the species tab
            is set to: see summarizeShelters for why. */}
        {species.length > 0 && (
          <p className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs tabular-nums">
            {species.map(({ species: kind, count }) => {
              const Icon = SPECIES_ICONS[kind];
              return (
                <span
                  key={kind}
                  data-pick-species={kind}
                  role="img"
                  className="inline-flex items-center gap-1.5"
                  aria-label={`${speciesLabel(kind, locale)}: ${count}`}
                >
                  <Icon className="size-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
                  {speciesLabel(kind, locale)}: {count}
                </span>
              );
            })}
          </p>
        )}

        {/* Equal thumbnails keep every face unobscured. The first photo still
            belongs to the longest-waiting animal when one is available. */}
        {faces.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">{labels.previews}</p>
            <div className="grid max-w-72 grid-cols-3 gap-2">
              {faces.map((face) => (
                <span
                  key={face.src}
                  className="relative aspect-[4/3] min-w-0 overflow-hidden rounded-ui border border-border/60 bg-muted"
                >
                  <Image
                    src={thumbnailUrl(face.src)}
                    alt={face.name}
                    fill
                    sizes="6rem"
                    className="object-cover"
                  />
                </span>
              ))}
            </div>
          </div>
        )}

        {/* The one animal a number cannot stand in for. Same hourglass and same
            warm mark the animal card gives a long wait, so the two marks are
            one mark. The token carries the dark value the raw amber pair spelled
            by hand. */}
        {summary?.longestWaiting && (
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <Hourglass
              className="mt-0.5 size-3.5 shrink-0 text-[var(--status-warn-mark)]"
              strokeWidth={1.75}
              aria-hidden
            />
            <span className="min-w-0 leading-relaxed">
              {t("longestWaiting", summary.longestWaiting)}
            </span>
          </p>
        )}
      </div>
    </div>
  );
}
