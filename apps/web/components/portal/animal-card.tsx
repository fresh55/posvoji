"use client";

import { useMemo, useState } from "react";
import {
  Check,
  ExternalLink,
  LoaderCircle,
  Pencil,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { m, useReducedMotion } from "motion/react";
import { AnimalEditor } from "@/components/portal/animal-editor";
import { OverrideMark, RevertButton } from "@/components/portal/override-mark";
import {
  SEARCHABLE_FIELDS,
  SEX_META,
  isPortalSex,
  isPortalStatus,
  portalSpeciesIcon,
  portalSpeciesLabel,
} from "@/components/portal/portal-fields";
import { fill, portalText } from "@/components/portal/portal-text";
import { StatusActions } from "@/components/portal/status-actions";
import type { PortalSaveState } from "@/hooks/portal-list";
import { Button } from "@/components/ui/button";
import type { AnimalFields } from "@/lib/animal";
import { thumbnailUrl } from "@/lib/animal-images";
import { animalPath } from "@/lib/animal-path";
import { ageInMonths } from "@/lib/filters";
import { formatAge } from "@/lib/labels";
import type {
  PortalAnimal,
  PortalAnimalPatch,
  PortalField,
  PortalShelter,
} from "@/lib/portal-api";

// The public site's arithmetic, read through the API's nulls, so the same
// birth date turns into the same number of months on both sides.
//
// The date it is measured from is deliberately not the same one. The public
// site reads ages off the export it is serving (see animal-grid.tsx), because
// its pages are prerendered and the ages printed on them have to match the
// list they were filtered into. The portal is looking at live records, so
// today is the honest answer here, and at a month boundary the two can differ
// by one month for the same animal.
function ageMonths(animal: PortalAnimal, now: Date): number | undefined {
  return ageInMonths(
    {
      birthDate: animal.birthDate ?? undefined,
      approximateAgeMonths: animal.approximateAgeMonths ?? undefined,
    },
    now,
  );
}

// The icon is chosen by the caller and handed over as a prop, the same way
// the animal dialog's facts do it.
function Glyph({
  icon: Icon,
  className,
}: {
  icon: LucideIcon;
  className: string;
}) {
  return <Icon className={className} strokeWidth={1.75} aria-hidden />;
}

/**
 * The searchable fields this animal still has no answer for, keys and all.
 * The line under the card prints the labels; the keys are what lets it open
 * the editor at the first of them.
 */
function missingFields(animal: PortalAnimal) {
  return SEARCHABLE_FIELDS.filter((field) => animal[field.key] === null);
}

/**
 * The public address of this animal's own page. animalPath() takes a dataset
 * animal and the portal never holds one, but it reads only the id, the name,
 * the species and the shelter's town and id (see lib/animal-path.ts), and the
 * portal has all five. The value is complete for the call, which is what the
 * cast stands on.
 *
 * The name is handed in rather than read off the animal. The address carries
 * the name, the public site is a static export rebuilt about every twelve
 * hours, and its animal route generates no page for a slug that was not in
 * that build (dynamicParams is false). A rename saved here therefore names a
 * page that does not exist yet, so the link keeps the name the animal was
 * listed under and the card says so beside it.
 */
function publicPath(
  animal: PortalAnimal,
  shelter: PortalShelter,
  name: string | null,
): string {
  const fields = {
    id: animal.id,
    name: name ?? undefined,
    species: animal.species ?? "zival",
    shelter: { id: shelter.slug, city: shelter.city ?? "" },
  } as unknown as AnimalFields;
  return animalPath(fields, "sl");
}

function metaLine(animal: PortalAnimal, now: Date): string {
  const months = ageMonths(animal, now);
  return [
    portalSpeciesLabel(animal.species),
    // Crawled or typed here, the breed is the word staff recognise the animal
    // by, so it sits next to the species rather than only inside the editor.
    animal.breed ?? "",
    isPortalSex(animal.sex) && animal.sex !== "unknown"
      ? SEX_META[animal.sex].label.toLowerCase()
      : "",
    months === undefined ? "" : formatAge(months, "sl"),
  ]
    .filter(Boolean)
    .join(" · ");
}

export function PortalAnimalCard({
  animal,
  shelter,
  publicName = animal.name,
  saveState,
  onSave,
}: {
  animal: PortalAnimal;
  /** The shelter this card is listed under, for the public link's address. */
  shelter: PortalShelter;
  /**
   * The name the public site can already have a page for, which is the one
   * the list loaded with. Defaults to the animal's own name, which is what an
   * animal nobody has renamed in this session reads as.
   */
  publicName?: string | null;
  saveState: PortalSaveState;
  onSave: (patch: PortalAnimalPatch) => Promise<boolean>;
}) {
  const shouldReduceMotion = useReducedMotion();
  const [editing, setEditing] = useState(false);
  // The field the editor should open at, set only when the card names one.
  const [editorField, setEditorField] = useState<PortalField | null>(null);
  const now = useMemo(() => new Date(), []);

  function openEditor(field: PortalField | null) {
    setEditorField(field);
    setEditing(true);
  }

  const speciesIcon = portalSpeciesIcon(animal.species);
  const name = animal.name ?? portalText.unnamed;
  const status = isPortalStatus(animal.status) ? animal.status : null;
  const overrideCount = Object.keys(animal.overrides).length;
  const statusOverridden = Object.prototype.hasOwnProperty.call(
    animal.overrides,
    "status",
  );
  const saving = saveState.status === "saving";
  const failed = saveState.status === "error";
  const missing = missingFields(animal);
  // The public page is still filed under the older name, so the link below
  // does not match the name above it and the card has to say why.
  const renamed = publicName !== animal.name;

  return (
    <article className="space-y-3 rounded-ui border p-3 transition-colors hover:border-foreground/25 focus-within:border-foreground/25 sm:p-4">
      <div className="flex items-start gap-3">
        {animal.thumbnailUrl ? (
          // next/image would need a build-time allowlist of every shelter
          // domain, since a cache-permitted photo can still fall back to the
          // shelter's own host. thumbnailUrl() rewrites our own cached copies
          // to the 112px derivative; anything else passes through unchanged.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumbnailUrl(animal.thumbnailUrl)}
            alt=""
            loading="lazy"
            decoding="async"
            className="size-16 shrink-0 rounded-ui border bg-muted/40 object-cover"
          />
        ) : (
          <span
            aria-hidden
            className="grid size-16 shrink-0 place-items-center rounded-ui border bg-muted/40 text-muted-foreground"
          >
            <Glyph icon={speciesIcon} className="size-6" />
          </span>
        )}

        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="min-w-0 truncate font-medium">{name}</h3>
            {overrideCount > 0 && (
              <OverrideMark
                className="shrink-0"
                aria-label={fill(portalText.editedCount, {
                  count: overrideCount,
                })}
              />
            )}
          </div>
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            {/* Only next to a photo. Without one the square to the left is
                already this same icon, and drawing it twice on one row says
                nothing the placeholder has not said. */}
            {animal.thumbnailUrl && (
              <Glyph icon={speciesIcon} className="size-3.5 shrink-0" />
            )}
            <span className="truncate">{metaLine(animal, now)}</span>
          </p>
        </div>

        {/* One quiet place for the outcome of a save, so a status tap and a
            dialog save report themselves the same way. Each state mounts
            and fades in on its own; nothing animates on the way out, so a
            stalled exit can never leave a stale label behind. */}
        <div aria-live="polite" className="min-h-6 shrink-0">
          {saving && (
            <m.span
              key="saving"
              initial={shouldReduceMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground"
            >
              <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
              {portalText.saving}
            </m.span>
          )}
          {saveState.status === "saved" && (
            <m.span
              key="saved"
              initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className="inline-flex items-center gap-1 rounded-4xl border border-[var(--filter-accent-border)] bg-[var(--filter-accent)] px-1.5 py-0.5 text-2xs font-medium text-[var(--filter-accent-foreground)]"
            >
              <Check className="size-3" strokeWidth={2.6} aria-hidden />
              {portalText.saved}
            </m.span>
          )}
        </div>
      </div>

      <div>
        <div className="mb-2 flex min-h-6 items-center justify-between gap-2">
          <h4 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {portalText.statusLegend}
          </h4>
          {!statusOverridden && status === null && (
            <span className="text-2xs text-muted-foreground">
              {portalText.statusUnknown}
            </span>
          )}
        </div>
        <StatusActions
          value={status}
          source={statusOverridden ? "shelter" : "site"}
          busy={saving}
          onSelect={(next) => void onSave({ status: next })}
        />
        {/* Under the buttons, not in the header's corner: the sentence is
            about the row it sits below, and it is read after the shelter has
            seen the highlighted button rather than before.
            One flex line, never two. The sentence is flex-1 and wraps inside
            its own column, so the control stays beside it at 375px instead of
            being orphaned onto a line of its own.
            mt-3, not mt-2: the control below carries max-lg:tap-target, whose
            layer overhangs its 24px drawing by 10px per side, and the status
            buttons above are the neighbour that 12px keeps clear of it. See
            the utility's note in globals.css. */}
        {(statusOverridden || status !== null) && (
          <div className="mt-3 flex items-center gap-2">
            <p className="min-w-0 flex-1 text-2xs leading-relaxed text-muted-foreground">
              {statusOverridden
                ? portalText.statusOwnLine
                : portalText.statusFromSiteLine}
            </p>
            {statusOverridden ? (
              <RevertButton
                className="max-lg:tap-target"
                field={portalText.statusLegend}
                disabled={saving}
                onRevert={() => void onSave({ status: null })}
              />
            ) : (
              // Tapping the already-pressed status card pins the value too,
              // but nothing about a pressed card offers that. This is the
              // same save with a name on it, and the sentence to its left is
              // what makes it findable without a hover title.
              <Button
                type="button"
                variant="ghost"
                size="xs"
                disabled={saving}
                aria-label={portalText.statusConfirmLabel}
                onClick={() => void onSave({ status })}
                className="h-6 shrink-0 gap-1 px-1.5 text-2xs font-normal text-muted-foreground max-lg:tap-target hover:text-foreground"
              >
                <Check aria-hidden />
                {portalText.statusConfirm}
              </Button>
            )}
          </div>
        )}
      </div>

      {missing.length > 0 && (
        // Sits directly above the button that opens the editor, so the list
        // and the way to answer it read as one thing. The line is also the
        // shortest way in: it opens the editor at the first field it names,
        // instead of leaving the shelter to find that field in the form.
        //
        // What it does goes in the title, not in an aria-label: the visible
        // text has to stay the accessible name, or voice control has no way
        // to say this button's name (WCAG 2.5.3).
        <button
          type="button"
          disabled={saving}
          title={fill(portalText.missingOpen, { name })}
          onClick={() => openEditor(missing[0].key)}
          className="block w-full rounded-ui text-left text-2xs leading-relaxed text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
        >
          <span className="font-medium">{portalText.missingTitle}</span>{" "}
          <span className="underline decoration-dotted underline-offset-2">
            {missing.map((field) => field.label).join(", ")}
          </span>
        </button>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={saving}
            onClick={() => openEditor(null)}
          >
            <Pencil aria-hidden />
            {portalText.edit}
          </Button>

          {/* The listing as an adopter reads it. A new tab, because the
              shelter is working through a list and must not lose its place. */}
          <Button asChild variant="ghost" size="sm">
            <a
              href={publicPath(animal, shelter, publicName)}
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink aria-hidden />
              {portalText.publicListing}
            </a>
          </Button>
        </div>

        {failed && (
          <p
            role="alert"
            className="flex items-start gap-1.5 text-xs text-destructive"
          >
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            {saveState.message}
          </p>
        )}
      </div>

      {/* Directly under the link it is about, and only once the name here and
          the name on the public page have parted: a shelter that has renamed
          nothing never reads a word about publication schedules. */}
      {renamed && (
        <p className="text-2xs leading-relaxed text-muted-foreground">
          {portalText.publicRenamed}
        </p>
      )}

      <AnimalEditor
        animal={animal}
        open={editing}
        onOpenChange={setEditing}
        initialField={editorField}
        saveState={saveState}
        onSave={onSave}
      />
    </article>
  );
}
