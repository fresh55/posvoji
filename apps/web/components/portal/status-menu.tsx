"use client";

import {
  Check,
  ChevronDown,
  CircleDashed,
  LoaderCircle,
  Undo2,
} from "lucide-react";
import { statusOf } from "@/components/portal/animal-meta";
import {
  CHOICE_CARD_INHERITED,
  STATUS_META,
} from "@/components/portal/portal-fields";
import { fill, portalText } from "@/components/portal/portal-text";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PORTAL_STATUSES, type PortalAnimal, type PortalAnimalPatch } from "@/lib/portal-api";
import { cn } from "@/lib/utils";

/**
 * The status of one animal as a pill that opens a menu: the same four values
 * StatusBlock offers, and the same two extra saves (confirm the crawl's
 * reading, give it back), on one line of a list instead of a block on a card.
 *
 * The list draws this and the editor page draws StatusBlock. The list is a
 * row per animal and has no room for four buttons and the sentence that
 * explains them; the page is looking at one animal and has room for both.
 */
export function StatusMenu({
  animal,
  busy,
  onSave,
}: {
  animal: PortalAnimal;
  busy: boolean;
  onSave: (patch: PortalAnimalPatch) => void;
}) {
  const { status, source } = statusOf(animal);
  const inherited = source === "site";
  const meta = status === null ? null : STATUS_META[status];
  const label = meta?.label ?? portalText.statusUnknown;
  const Icon = meta?.icon ?? CircleDashed;
  // Both strings are written to be read after the value ("Na voljo, prebrano
  // z vaše spletne strani"), so as a menu heading they start the line and are
  // capitalised here rather than kept twice in portal-text.
  const sourceLine = sentence(
    inherited ? portalText.statusSourceSite : portalText.statusSourceOwn,
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={busy}>
        <button
          type="button"
          className={cn(
            "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring disabled:opacity-50",
            status !== null && !inherited
              ? STATUS_META[status].badge
              : // A value the crawl read is not an answer the shelter gave, so
                // it stays dashed and muted until they confirm it. Same reason
                // and same drawing as the inherited choice card.
                CHOICE_CARD_INHERITED,
          )}
        >
          {/* The name is built out of visible text plus two sr-only halves:
              "Stanje" so the pill says which control it is, and whose answer
              this is after it. The visible word stays the start of the name,
              so voice control can say the pill (WCAG 2.5.3). */}
          <span className="sr-only">{`${portalText.statusLegend}: `}</span>
          <Icon className="size-3.5" strokeWidth={1.75} aria-hidden />
          <span>{label}</span>
          {/* A status the crawl never read has no source to name: saying it
              was read from the shelter's page would be untrue of "Ni podatka". */}
          {status !== null && (
            <span className="sr-only">
              {`, ${inherited ? portalText.statusSourceSite : portalText.statusSourceOwn}`}
            </span>
          )}
          {busy ? (
            <LoaderCircle
              className="size-3.5 animate-spin text-muted-foreground"
              aria-hidden
            />
          ) : (
            <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden />
          )}
        </button>
      </DropdownMenuTrigger>

      {/* w-52 on purpose: the content defaults to the trigger's width, and the
          trigger is a pill as wide as one word. */}
      <DropdownMenuContent align="end" className="w-52">
        {status !== null && (
          <>
            <DropdownMenuLabel>{sourceLine}</DropdownMenuLabel>
            {inherited && (
              <>
                {/* The one save that settles an inherited value. It names the
                    status, because confirming is choosing that value. */}
                <DropdownMenuItem onSelect={() => onSave({ status })}>
                  <Check aria-hidden />
                  {fill(portalText.statusConfirmAs, { status: label })}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}
          </>
        )}

        <DropdownMenuRadioGroup value={status ?? ""}>
          {PORTAL_STATUSES.map((option) => {
            const optionMeta = STATUS_META[option];
            const OptionIcon = optionMeta.icon;
            return (
              <DropdownMenuRadioItem
                key={option}
                value={option}
                onSelect={() => {
                  // Picking the value that is already the shelter's own is not
                  // an edit. Picking the one the site states is: it confirms
                  // it, which is what stops the next crawl from moving it.
                  if (option === status && !inherited) return;
                  onSave({ status: option });
                }}
              >
                <OptionIcon className="size-4" strokeWidth={1.75} aria-hidden />
                {optionMeta.label}
              </DropdownMenuRadioItem>
            );
          })}
        </DropdownMenuRadioGroup>

        {!inherited && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              title={portalText.revertHint}
              onSelect={() => onSave({ status: null })}
            >
              <Undo2 aria-hidden />
              {portalText.statusRevertItem}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** A line written to be read mid-sentence, used at the start of one. */
function sentence(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
