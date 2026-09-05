"use client";

import { Check } from "lucide-react";
import { RevertButton } from "@/components/portal/override-mark";
import { isPortalStatus } from "@/components/portal/portal-fields";
import { portalText } from "@/components/portal/portal-text";
import { StatusActions } from "@/components/portal/status-actions";
import { Button } from "@/components/ui/button";
import type { PortalAnimal, PortalAnimalPatch } from "@/lib/portal-api";

/**
 * The four status buttons with everything that explains them: whose answer
 * the current value is, the way to confirm the crawl's reading, and the way
 * to give it back.
 *
 * The card and the editor page both draw this, and both save the moment a
 * button is tapped. One copy, because the two are the same control on two
 * screens and a shelter that learns it on the list must not meet a different
 * one on the page.
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
  const status = isPortalStatus(animal.status) ? animal.status : null;
  const overridden = Object.prototype.hasOwnProperty.call(
    animal.overrides,
    "status",
  );

  return (
    <div>
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
