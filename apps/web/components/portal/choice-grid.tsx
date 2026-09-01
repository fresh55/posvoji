"use client";

import {
  CHOICE_CARD_MUTED,
  choiceCard,
  type ChoiceMeta,
} from "@/components/portal/portal-fields";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";

/**
 * Tailwind needs the class whole, so the row widths a field can have are
 * listed rather than built from options.length.
 */
const COLUMNS: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-3",
  // Species and status both have four answers, and four across a dialog on a
  // phone leaves about 65px a card, which "Rezerviran" does not fit into at
  // any wrap. Two rows of two until there is room, the same shape the card's
  // status row uses.
  4: "grid-cols-2 sm:grid-cols-4",
};

/**
 * One row of icon cards for a field with a small fixed set of answers. Every
 * such field in the editor is this component, so the rows cannot drift apart:
 * what differs between them is the options and their meta, not the markup.
 *
 * A single-select ToggleGroup, not a row of aria-pressed buttons: Radix gives
 * the row radiogroup/radio with aria-checked and one tab stop, and a tap on
 * the chosen card deselects it. That deselect is the only way back out of a
 * mis-tap on an animal with nothing saved yet, where there is no override to
 * revert and so no Povrni to press.
 */
export function ChoiceGrid<Value extends string>({
  label,
  options,
  meta,
  value,
  onPick,
  disabled,
  describedBy,
}: {
  /** Names the group for screen readers; the visible label sits above it. */
  label: string;
  options: readonly Value[];
  meta: Record<Value, ChoiceMeta>;
  value: Value | null;
  /** null is the answer taken back: the card that was on has been tapped off. */
  onPick: (value: Value | null) => void;
  disabled: boolean;
  /** The field's hint, so the group carries it as its description. */
  describedBy?: string;
}) {
  return (
    <ToggleGroup
      type="single"
      // Radix carries "no answer" as the empty string on both sides.
      value={value ?? ""}
      onValueChange={(next) => onPick(next === "" ? null : (next as Value))}
      aria-label={label}
      aria-describedby={describedBy}
      disabled={disabled}
      spacing={1.5}
      // A grid over the group's own flex w-fit, so the cards divide the row
      // instead of sizing to their labels.
      className={cn(
        "grid w-full items-stretch",
        COLUMNS[options.length] ?? "grid-cols-3",
      )}
    >
      {options.map((option) => {
        const {
          icon: Icon,
          iconClass,
          mutedWhenSelected,
          label: text,
        } = meta[option];
        const selected = value === option;
        return (
          <ToggleGroupItem
            key={option}
            value={option}
            // Three columns in a dialog leave about 100px a card on a phone,
            // which "Uravnotežen" does not fit beside its icon. Stacked and
            // wrapping below sm, side by side once there is room; min-h so a
            // second line grows the card instead of being cut off.
            // whitespace-normal and h-auto undo two of toggleVariants' own:
            // its whitespace-nowrap would keep the label on one line whatever
            // the width, and its h-9 would fix the card at one line's height.
            className={choiceCard(
              selected,
              cn(
                "h-auto min-h-11 flex-col gap-0.5 px-1.5 py-1.5 text-center text-xs leading-tight font-medium whitespace-normal sm:flex-row sm:gap-1.5 sm:px-2",
                selected && mutedWhenSelected && CHOICE_CARD_MUTED,
              ),
            )}
          >
            <Icon
              className={iconClass ?? "size-4"}
              strokeWidth={1.75}
              aria-hidden
            />
            <span className="max-w-full">{text}</span>
          </ToggleGroupItem>
        );
      })}
    </ToggleGroup>
  );
}
