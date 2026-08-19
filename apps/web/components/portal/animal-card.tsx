"use client";

import { useMemo, useState } from "react";
import {
  Check,
  LoaderCircle,
  Pencil,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { m, useReducedMotion } from "motion/react";
import { AnimalEditor } from "@/components/portal/animal-editor";
import { OverrideMark, RevertButton } from "@/components/portal/override-mark";
import {
  SEX_META,
  isPortalSex,
  isPortalStatus,
  portalSpeciesIcon,
  portalSpeciesLabel,
} from "@/components/portal/portal-fields";
import { fill, portalText } from "@/components/portal/portal-text";
import { StatusActions } from "@/components/portal/status-actions";
import type { PortalSaveState } from "@/hooks/use-portal-animals";
import { Button } from "@/components/ui/button";
import { ageInMonths } from "@/lib/filters";
import { formatAge } from "@/lib/labels";
import type { PortalAnimal, PortalAnimalPatch } from "@/lib/portal-api";

// The public site's arithmetic, read through the API's nulls, so a shelter
// and a visitor never read a different age off the same birth date.
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

function metaLine(animal: PortalAnimal, now: Date): string {
  const months = ageMonths(animal, now);
  return [
    portalSpeciesLabel(animal.species),
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
  saveState,
  onSave,
}: {
  animal: PortalAnimal;
  saveState: PortalSaveState;
  onSave: (patch: PortalAnimalPatch) => Promise<boolean>;
}) {
  const shouldReduceMotion = useReducedMotion();
  const [editing, setEditing] = useState(false);
  const now = useMemo(() => new Date(), []);

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

  return (
    <article className="space-y-3 rounded-ui border p-3 transition-colors hover:border-foreground/25 focus-within:border-foreground/25 sm:p-4">
      <div className="flex items-start gap-3">
        {animal.thumbnailUrl ? (
          // The thumbnail is whatever the crawl found, usually still on the
          // shelter's own host, so next/image would need a build-time
          // allowlist of every shelter domain.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={animal.thumbnailUrl}
            alt=""
            loading="lazy"
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
            <Glyph icon={speciesIcon} className="size-3.5 shrink-0" />
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
              initial={
                shouldReduceMotion ? false : { opacity: 0, scale: 0.92 }
              }
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className="inline-flex items-center gap-1 rounded-4xl border border-[var(--filter-accent-border)] bg-[var(--filter-accent)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--filter-accent-foreground)]"
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
          {statusOverridden ? (
            <RevertButton
              field={portalText.statusLegend}
              disabled={saving}
              onRevert={() => void onSave({ status: null })}
            />
          ) : (
            status === null && (
              <span className="text-[11px] text-muted-foreground">
                {portalText.statusUnknown}
              </span>
            )
          )}
        </div>
        <StatusActions
          value={status}
          busy={saving}
          onSelect={(next) => void onSave({ status: next })}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={saving}
          onClick={() => setEditing(true)}
        >
          <Pencil aria-hidden />
          {portalText.edit}
        </Button>

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

      <AnimalEditor
        animal={animal}
        open={editing}
        onOpenChange={setEditing}
        saveState={saveState}
        onSave={onSave}
      />
    </article>
  );
}
