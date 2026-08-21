"use client";

import type { RefObject } from "react";
import Image from "next/image";
import { Check, Hourglass, X } from "lucide-react";
import { ShelterRows, type ShelterRow } from "@/components/filters/shelter-rows";
import { ShelterAvatar } from "@/components/shelter-avatar";
import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import { DialogClose } from "@/components/ui/dialog";
import { SPECIES_ICONS } from "@/lib/animal-icons";
import { thumbnailUrl } from "@/lib/animal-images";
import { formatKm } from "@/lib/geo";
import { animalCount, shelterCount, speciesLabel } from "@/lib/labels";
import type { MapPick } from "@/components/filters/shelter-map";
import type { ShelterSummary } from "@/lib/shelter-summary";
import { cn } from "@/lib/utils";

// Fixed per position, not random, so one shelter's fan leans the same way on
// every render. PhotoSpread's own nudge is tuned for full-size photos and
// disappears at chip scale, so this one leans harder.
const FACE_TILT = [-5, 4, -6] as const;

// The answer to a click on the map. The click itself already toggled, exactly
// as it always did; this is what the toggle was about. It sits at the top of
// the shelter panel and pushes the search boxes down rather than covering
// them, so nothing the visitor was reading is taken away.
//
// Hover is deliberately not wired to it: hover keeps the lightweight callout
// on the map, and the card is what a click buys.
export function MapPickCard({
  pick,
  rows,
  counts,
  selected,
  summaries,
  onToggle,
  onDismiss,
  cardRef,
}: {
  pick: MapPick;
  /** Every selectable shelter, already located and sorted the way the list
   *  below shows them, so the card reads the same km the rows do. */
  rows: ShelterRow[];
  counts: Map<string, number>;
  selected: string[];
  /** Per-shelter species breakdown and longest wait, keyed by shelter id.
   *  Absent while the picker is rendered without a dataset behind it (the map
   *  gallery, tests), and the card then simply says less. */
  summaries?: Map<string, ShelterSummary>;
  onToggle: (value: string) => void;
  onDismiss: () => void;
  /** So the panel can bring the card into view when it appears. */
  cardRef?: RefObject<HTMLDivElement | null>;
}) {
  const { locale, messages, t } = useI18n();

  const shelterRow =
    pick.kind === "shelter"
      ? rows.find((row) => row.value === pick.value)
      : undefined;
  // A pick the list has no row for is a shelter that is not selectable, and
  // there is nothing honest to put in a card about it.
  if (pick.kind === "shelter" && !shelterRow) return null;

  const groupRows =
    pick.kind === "group"
      ? rows.filter((row) => pick.values.includes(row.value))
      : [];
  if (pick.kind === "group" && groupRows.length === 0) return null;

  const title = pick.kind === "shelter" ? (shelterRow?.label ?? "") : pick.label;
  const checked = shelterRow ? selected.includes(shelterRow.value) : false;
  const summary = shelterRow ? summaries?.get(shelterRow.value) : undefined;
  const faces = summary?.faces ?? [];
  const sublabel = shelterRow
    ? [
        shelterRow.city,
        shelterRow.km === undefined
          ? undefined
          : formatKm(shelterRow.km, messages.lessThanOneKm),
      ]
        .filter(Boolean)
        .join(" · ")
    : `${shelterCount(groupRows.length, locale)} · ${animalCount(
        groupRows.reduce((sum, row) => sum + (counts.get(row.value) ?? 0), 0),
        locale,
      )}`;

  // A selected shelter's card wears the same accent surface its row does, so
  // the card and the row say "picked" in one language. Inside that surface the
  // quiet lines cannot use text-muted-foreground, which is mixed for the page
  // and not for the accent, so they step down from the accent's own ink.
  const quiet = checked
    ? "text-[var(--filter-accent-foreground)]/75"
    : "text-muted-foreground";

  return (
    <div
      ref={cardRef}
      data-map-pick-card={pick.kind}
      // Named, not announced: selection changes already narrate themselves
      // through the dialog's own live region (see location-picker.tsx), and a
      // second live region would say the same news twice.
      role="group"
      aria-label={t("shelterPickCardLabel", { label: title })}
      className={cn(
        "mb-3 shrink-0 rounded-ui border p-3",
        checked
          ? "border-[var(--filter-accent-strong)] bg-[var(--filter-accent)] text-[var(--filter-accent-foreground)]"
          : "bg-muted/40",
      )}
    >
      <div className="flex items-start gap-2">
        {/* A group pick has no single shelter to put a face to, and
            shelterRow is exactly the signal the rest of the card already
            uses for that: it is set only when pick.kind is "shelter". */}
        {shelterRow && (
          <ShelterAvatar name={title} logo={summary?.logo} size="xs" />
        )}
        <div className="min-w-0 flex-1">
          <p className="flex min-w-0 items-center gap-1.5 text-sm font-medium">
            {checked && (
              <Check className="size-3.5 shrink-0" strokeWidth={2.25} aria-hidden />
            )}
            <span className="truncate">{title}</span>
          </p>
          {sublabel && (
            <p className={cn("truncate text-[11px]", quiet)}>{sublabel}</p>
          )}
        </div>
        {/* Quiet on purpose: the card is an answer, not a dialog of its own,
            and the next click replaces it anyway. */}
        <button
          type="button"
          onClick={onDismiss}
          aria-label={messages.closePickCard}
          className={cn(
            "-mr-1 -mt-1 inline-flex size-6 shrink-0 items-center justify-center rounded-ui transition-colors",
            checked
              ? "text-[var(--filter-accent-foreground)]/70 hover:text-[var(--filter-accent-foreground)]"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <X className="size-3.5" aria-hidden />
        </button>
      </div>

      {/* Who lives here, in the icons the species tabs and the result count
          already use. Every species the shelter has, whatever the species tab
          is set to: see summarizeShelters for why. */}
      {summary && summary.species.length > 0 && (
        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs tabular-nums">
          {summary.species.map(({ species, count }) => {
            const Icon = SPECIES_ICONS[species];
            return (
              <span
                key={species}
                data-pick-species={species}
                className="inline-flex items-center gap-1"
                aria-label={`${speciesLabel(species, locale)}: ${count}`}
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
          animal longestWaiting names, whenever that animal has a photo at
          all (see summarizeShelters), so this sits right above that line
          rather than anywhere else in the card. The ring is drawn from the
          card's own surface, neutral or accent, so an overlap reads as a cut
          edge on either one instead of a mismatched halo. */}
      {faces.length > 0 && (
        <div className="mt-2 flex items-center">
          {faces.map((face, index) => (
            <span
              key={face.src}
              className={cn(
                "relative size-11 shrink-0 overflow-hidden rounded-ui bg-muted ring-2",
                index > 0 && "-ml-4",
                checked ? "ring-[var(--filter-accent)]" : "ring-muted/40",
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

      {/* The one animal a number cannot stand in for. Same hourglass and same
          amber the animal card gives a long wait, so the two marks are one
          mark. */}
      {summary?.longestWaiting && (
        <p className={cn("mt-2 flex items-center gap-1.5 text-xs", quiet)}>
          <Hourglass
            className={cn(
              "size-3.5 shrink-0",
              !checked && "text-amber-600 dark:text-amber-400",
            )}
            strokeWidth={1.75}
            aria-hidden
          />
          <span className="min-w-0 truncate">
            {t("longestWaiting", summary.longestWaiting)}
          </span>
        </p>
      )}

      {/* What a region click toggled, spelled out. The rows are the list's own
          rows, so dropping one you did not mean is the same gesture here as it
          is below. */}
      {pick.kind === "group" && (
        <div className="mt-2 -mx-1">
          <ShelterRows
            rows={groupRows}
            counts={counts}
            selected={selected}
            onToggle={onToggle}
            lessThanOneKm={messages.lessThanOneKm}
          />
        </div>
      )}

      {/* The dialog's own way out, the same one the footer button uses:
          DialogClose closes through onOpenChange, which is where this picker
          keeps its closing logic. The selection is already applied, because a
          toggle applies the moment it happens. */}
      <DialogClose asChild>
        <Button size="sm" className="mt-3 w-full">
          {messages.showAnimals}
        </Button>
      </DialogClose>
    </div>
  );
}
