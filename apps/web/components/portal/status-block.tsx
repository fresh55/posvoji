"use client";

import { Check } from "lucide-react";
import { statusOf } from "@/components/portal/animal-meta";
import { RevertButton } from "@/components/portal/override-mark";
import { portalText } from "@/components/portal/portal-text";
import { StatusActions } from "@/components/portal/status-actions";
import { Button } from "@/components/ui/button";
import type {
  PortalAnimal,
  PortalAnimalPatch,
  PortalStatus,
} from "@/lib/portal-api";

/**
 * The same four buttons over a manual listing, which is the half of the block
 * below that a listing has: there is no site the value could have been read
 * from, so nothing is inherited, nothing needs confirming and there is nothing
 * to give back.
 *
 * The card and the listing's own page both draw this, and both save the moment
 * a button is tapped.
 */
export function ListingStatusBlock({
  status,
  busy,
  onSelect,
}: {
  status: PortalStatus | null;
  busy: boolean;
  onSelect: (status: PortalStatus) => void;
}) {
  return (
    // A container, so the row can count its own width: it is drawn full width
    // on the list and in the narrow summary column beside the form.
    <div className="@container">
      <div className="mb-2 flex min-h-6 items-center justify-between gap-2">
        {/* Not a heading, for the same reason as below: StatusActions is a
            group that already carries "Stanje" as its name. */}
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {portalText.statusLegend}
        </p>
      </div>
      <StatusActions
        value={status}
        source="shelter"
        busy={busy}
        onSelect={onSelect}
      />
    </div>
  );
}

/**
 * The four status buttons with everything that explains them: whose answer
 * the current value is, the way to confirm the crawl's reading, and the way
 * to give it back.
 *
 * The editor page draws this; the list draws StatusMenu, which folds the same
 * four values into a pill because a row has no width for four buttons and the
 * sentence that explains them. Both read whose answer the value is through
 * statusOf, so the two presentations cannot disagree about that, and both save
 * the moment a value is chosen.
 */
export function StatusBlock({
  animal,
  busy,
  onSave,
}: {
  animal: PortalAnimal;
  busy: boolean;
  onSave: (patch: PortalAnimalPatch) => void;
}) {
  const { status, source } = statusOf(animal);
  const overridden = source === "shelter";

  return (
    // A container, so the status row can count its own width. See
    // StatusActions: the same four buttons sit across a card and inside the
    // editor's narrow summary column.
    <div className="@container">
      <div className="mb-2 flex min-h-6 items-center justify-between gap-2">
        {/* Not a heading: StatusActions is a group that already carries
            "Stanje" as its name, and the two surfaces this is drawn on sit
            under headings of different levels. */}
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {portalText.statusLegend}
        </p>
        {!overridden && status === null && (
          <span className="text-2xs text-muted-foreground">
            {portalText.statusUnknown}
          </span>
        )}
      </div>
      <StatusActions
        value={status}
        source={overridden ? "shelter" : "site"}
        busy={busy}
        onSelect={(next) => onSave({ status: next })}
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
      {(overridden || status !== null) && (
        <div className="mt-3 flex items-center gap-2">
          <p className="min-w-0 flex-1 text-2xs leading-relaxed text-muted-foreground">
            {overridden
              ? portalText.statusOwnLine
              : portalText.statusFromSiteLine}
          </p>
          {overridden ? (
            <RevertButton
              className="max-lg:tap-target"
              field={portalText.statusLegend}
              disabled={busy}
              onRevert={() => onSave({ status: null })}
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
              disabled={busy}
              aria-label={portalText.statusConfirmLabel}
              onClick={() => onSave({ status })}
              className="h-6 shrink-0 gap-1 px-1.5 text-2xs font-normal text-muted-foreground max-lg:tap-target hover:text-foreground"
            >
              <Check aria-hidden />
              {portalText.statusConfirm}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
