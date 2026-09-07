"use client";

import { useMemo } from "react";
import { Pencil, TriangleAlert } from "lucide-react";
import Link from "next/link";
import {
  missingSearchableFields,
  portalMetaLine,
} from "@/components/portal/animal-meta";
import { Glyph } from "@/components/portal/glyph";
import { listingInput } from "@/components/portal/listing-draft";
import { DraftMark, PORTAL_BADGE } from "@/components/portal/override-mark";
import {
  STATUS_META,
  isPortalStatus,
  portalSpeciesIcon,
} from "@/components/portal/portal-fields";
import { fill, portalText } from "@/components/portal/portal-text";
import { SaveStatusPip } from "@/components/portal/save-status";
import { ListingStatusBlock } from "@/components/portal/status-block";
import type { PortalSaveState } from "@/hooks/portal-list";
import type { PortalListingActions } from "@/hooks/use-portal-listings";
import { portalAnimalPath } from "@/hooks/use-portal-session";
import { Button } from "@/components/ui/button";
import type { PortalListing } from "@/lib/portal-api";
import { cn } from "@/lib/utils";

/**
 * One manual listing, laid out as the crawled card is so a shelter that has
 * seen one knows the other. What is missing is what a listing does not have:
 * no edit marks, no "read from your site" line, no way back to a crawl.
 */
export function PortalListingCard({
  listing,
  shelter,
  hasDraft = false,
  saveState,
  actions,
}: {
  listing: PortalListing;
  /** The slug the editor page is opened under. */
  shelter: string;
  /** This tab is holding typed work for this listing that was never saved. */
  hasDraft?: boolean;
  saveState: PortalSaveState;
  /** The hook's, already bound to the shelter. */
  actions: PortalListingActions;
}) {
  const now = useMemo(() => new Date(), []);

  const speciesIcon = portalSpeciesIcon(listing.species);
  const photo = listing.photos[0];
  const status = isPortalStatus(listing.status) ? listing.status : null;
  const saving = saveState.status === "saving";
  const failed = saveState.status === "error";
  const missing = missingSearchableFields(listing);

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
              <span className={cn(PORTAL_BADGE, STATUS_META[status].badge)}>
                {STATUS_META[status].label}
              </span>
            )}
            {hasDraft && <DraftMark className="shrink-0" />}
          </div>
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            {photo && <Glyph icon={speciesIcon} className="size-3.5 shrink-0" />}
            <span className="truncate">{portalMetaLine(listing, now)}</span>
          </p>
        </div>

        {/* One quiet place for the outcome of a save, so a status tap and a
            save made on the listing's own page report themselves the same. */}
        <SaveStatusPip state={saveState} />
      </div>

      {/* Always the shelter's own answer: there is no site to have read it
          from, so nothing here is inherited and nothing needs confirming. The
          route is a full replace, so the tap sends the whole listing with the
          status swapped. */}
      <ListingStatusBlock
        status={status}
        busy={saving}
        onSelect={(next) =>
          void actions.update(listing.id, {
            ...listingInput(listing),
            status: next,
          })
        }
      />

      {missing.length > 0 && (
        // Sits directly above the link that opens the editor, and is itself
        // the shortest way in: it opens the page at the first field it names.
        // What it does goes in the title, not in an aria-label: the visible
        // text has to stay the accessible name (WCAG 2.5.3).
        <Link
          href={portalAnimalPath(shelter, listing.id, missing[0].key)}
          title={fill(portalText.missingOpen, { name: listing.name })}
          className="block w-full rounded-ui text-left text-2xs leading-relaxed text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring"
        >
          <span className="font-medium">{portalText.missingTitle}</span>{" "}
          <span className="underline decoration-dotted underline-offset-2">
            {missing.map((field) => field.label).join(", ")}
          </span>
        </Link>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* next/link, not an anchor: the editor is a page of the portal and
            the whole point of going there without a document load is that the
            session and this list stay in memory behind it. */}
        <Button asChild variant="outline" size="sm">
          <Link href={portalAnimalPath(shelter, listing.id)}>
            <Pencil aria-hidden />
            {portalText.edit}
          </Link>
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
    </article>
  );
}
