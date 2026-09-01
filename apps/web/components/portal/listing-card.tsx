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
import { ListingForm, listingInput } from "@/components/portal/listing-form";
import {
  SEARCHABLE_FIELDS,
  SEX_META,
  STATUS_META,
  isPortalSex,
  isPortalStatus,
  portalSpeciesIcon,
  portalSpeciesLabel,
} from "@/components/portal/portal-fields";
import { fill, portalText } from "@/components/portal/portal-text";
import { StatusActions } from "@/components/portal/status-actions";
import type { PortalSaveState } from "@/hooks/use-portal-animals";
import type { PortalListingActions } from "@/hooks/use-portal-listings";
import { Button } from "@/components/ui/button";
import { ageInMonths } from "@/lib/filters";
import { formatAge } from "@/lib/labels";
import type { PortalField, PortalListing } from "@/lib/portal-api";
import { cn } from "@/lib/utils";

// The public site's arithmetic, read through the API's nulls, so the same
// birth date turns into the same number of months on both sides. Measured
// from today, as the crawled card does: the portal is looking at live records.
function ageMonths(listing: PortalListing, now: Date): number | undefined {
  return ageInMonths(
    {
      birthDate: listing.birthDate ?? undefined,
      approximateAgeMonths: listing.approximateAgeMonths ?? undefined,
    },
    now,
  );
}

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
 * The searchable fields this listing still has no answer for, keys and all.
 * The line under the card prints the labels; the keys are what lets it open
 * the form at the first of them.
 */
function missingFields(listing: PortalListing) {
  return SEARCHABLE_FIELDS.filter((field) => listing[field.key] === null);
}

function metaLine(listing: PortalListing, now: Date): string {
  const months = ageMonths(listing, now);
  return [
    portalSpeciesLabel(listing.species),
    listing.breed ?? "",
    isPortalSex(listing.sex) && listing.sex !== "unknown"
      ? SEX_META[listing.sex].label.toLowerCase()
      : "",
    months === undefined ? "" : formatAge(months, "sl"),
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * One manual listing, laid out as the crawled card is so a shelter that has
 * seen one knows the other. What is missing is what a listing does not have:
 * no edit marks, no "read from your site" line, no way back to a crawl.
 */
export function PortalListingCard({
  listing,
  saveState,
  actions,
}: {
  listing: PortalListing;
  saveState: PortalSaveState;
  /** The hook's, already bound to the shelter. */
  actions: PortalListingActions;
}) {
  const shouldReduceMotion = useReducedMotion();
  const [editing, setEditing] = useState(false);
  // The field the form should open at, set only when the card names one.
  const [formField, setFormField] = useState<PortalField | null>(null);
  const now = useMemo(() => new Date(), []);

  function openForm(field: PortalField | null) {
    setFormField(field);
    setEditing(true);
  }

  const speciesIcon = portalSpeciesIcon(listing.species);
  const photo = listing.photos[0];
  const status = isPortalStatus(listing.status) ? listing.status : null;
  const saving = saveState.status === "saving";
  const failed = saveState.status === "error";
  const missing = missingFields(listing);

  return (
    <article className="space-y-3 rounded-ui border p-3 transition-colors hover:border-foreground/25 focus-within:border-foreground/25 sm:p-4">
      <div className="flex items-start gap-3">
        {photo ? (
          // The API host is not one next/image knows, and the stored copy is
          // already capped at 2048px; the box is what sizes it.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photo.url}
            width={photo.width}
            height={photo.height}
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
            <h3 className="min-w-0 truncate font-medium">{listing.name}</h3>
            {/* The status at a glance, in the colour the row below gives it.
                Where the crawled card puts its edit mark: on a listing every
                value is the shelter's own, so the mark would say nothing. */}
            {status && (
              <span
                className={cn(
                  "inline-flex h-5 shrink-0 items-center rounded-4xl border px-1.5 text-2xs font-medium",
                  STATUS_META[status].badge,
                )}
              >
                {STATUS_META[status].label}
              </span>
            )}
          </div>
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            {photo && <Glyph icon={speciesIcon} className="size-3.5 shrink-0" />}
            <span className="truncate">{metaLine(listing, now)}</span>
          </p>
        </div>

        {/* One quiet place for the outcome of a save, so a status tap and a
            dialog save report themselves the same way. */}
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
        </div>
        {/* Always the shelter's own answer: there is no site to have read it
            from, so nothing here is inherited and nothing needs confirming.
            The route is a full replace, so the tap sends the whole listing
            with the status swapped. */}
        <StatusActions
          value={status}
          source="shelter"
          busy={saving}
          onSelect={(next) =>
            void actions.update(listing.id, {
              ...listingInput(listing),
              status: next,
            })
          }
        />
      </div>

      {missing.length > 0 && (
        // Sits directly above the button that opens the form, and is itself
        // the shortest way in: it opens the form at the first field it names.
        // What it does goes in the title, not in an aria-label: the visible
        // text has to stay the accessible name (WCAG 2.5.3).
        <button
          type="button"
          disabled={saving}
          title={fill(portalText.missingOpen, { name: listing.name })}
          onClick={() => openForm(missing[0].key)}
          className="block w-full rounded-ui text-left text-2xs leading-relaxed text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
        >
          <span className="font-medium">{portalText.missingTitle}</span>{" "}
          <span className="underline decoration-dotted underline-offset-2">
            {missing.map((field) => field.label).join(", ")}
          </span>
        </button>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={saving}
          onClick={() => openForm(null)}
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

      <ListingForm
        listing={listing}
        open={editing}
        onOpenChange={setEditing}
        actions={actions}
        saveState={saveState}
        initialField={formField}
      />
    </article>
  );
}
