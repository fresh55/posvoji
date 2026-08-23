"use client";

import type { RefObject } from "react";
import Image from "next/image";
import { Check, Hourglass, X } from "lucide-react";
import { ShelterRows, type ShelterRow } from "@/components/filters/shelter-rows";
import { ShelterAvatar } from "@/components/shelter-avatar";
import { useI18n } from "@/components/i18n-provider";
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

// The answer to a click on the map. Not always to a toggle: a click on
// something already picked re-asks about it and changes no filter at all (see
// handlePick), so this is what the click was about rather than what it
// changed. It sits directly above the list, under the search boxes, so it
// reads as the row you just picked opened up rather than as a panel dropped
// on top of the search.
//
// It carries no button. The dialog has one primary action, the confirm pill in
// the footer, and that pill is the only control that knows the real number:
// a second "show animals" next to one shelter's own count promised that
// shelter's animals and applied every filter in the dialog. What is left here
// is the one thing nothing else on this screen says, the faces and the longest
// wait, plus enough naming to know which shelter they belong to.
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
  onDrop,
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
  /** Set only when the corner control should un-choose what the card stands
   *  for, which the picker decides: a shelter card's X drops its shelter,
   *  a group card's X only closes, because a region comes off through its own
   *  rows. Whether a pick is droppable is a fact about the selection, and the
   *  card has no business deriving it from the shape of its pick. */
  onDrop?: () => void;
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

  return (
    <div
      ref={cardRef}
      data-map-pick-card={pick.kind}
      // Named, not announced: selection changes already narrate themselves
      // through the dialog's own live region (see location-picker.tsx), and a
      // second live region would say the same news twice.
      role="group"
      aria-label={t("shelterPickCardLabel", { label: title })}
      // The card used to be filled with --filter-accent, which made a
      // confirmation the loudest object in a panel whose real work happens in
      // the quiet list under it. "Picked" is already said by the row's own
      // accent, by the region on the map and by the count in the footer; here
      // it needs a rule, not a flood. The recessed surface reads as a peek at
      // the list rather than as a card laid over it.
      className={cn(
        "mb-2 shrink-0 rounded-ui border bg-muted/40 p-3",
        checked && "border-l-2 border-l-[var(--filter-accent-strong)]",
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
              <Check
                className="size-3.5 shrink-0 text-[var(--filter-accent-strong)]"
                strokeWidth={2.25}
                aria-hidden
              />
            )}
            <span className="truncate">{title}</span>
          </p>
          {sublabel && (
            <p className="truncate text-[11px] text-muted-foreground">
              {sublabel}
            </p>
          )}
        </div>
        {/* Given an onDrop, this drops what the card stands for rather than
            just hiding the card: an X that left the filter in place behind it
            was the one control here anybody would reach for to correct a
            misclick, and it silently did nothing. Without one it closes, which
            is what a group card gets, because a region comes off through its
            own rows one at a time. The label says which of the two it is. */}
        <button
          type="button"
          onClick={onDrop ?? onDismiss}
          aria-label={onDrop ? messages.dropPickCard : messages.closePickCard}
          // The glyph stays small; below lg the button's box is the 44px
          // touch target the rest of the picker's mobile chrome keeps.
          className="-mr-1 -mt-1 inline-flex size-11 shrink-0 items-center justify-center rounded-ui text-muted-foreground transition-colors hover:text-foreground lg:size-6"
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
          card's own surface, so an overlap reads as a cut edge rather than as
          a mismatched halo. */}
      {faces.length > 0 && (
        <div className="mt-2 flex items-center">
          {faces.map((face, index) => (
            <span
              key={face.src}
              className={cn(
                "relative size-11 shrink-0 overflow-hidden rounded-ui bg-muted ring-2 ring-muted/40",
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

      {/* The one animal a number cannot stand in for. Same hourglass and same
          amber the animal card gives a long wait, so the two marks are one
          mark. */}
      {summary?.longestWaiting && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Hourglass
            className="size-3.5 shrink-0 text-amber-600 dark:text-amber-400"
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
    </div>
  );
}
