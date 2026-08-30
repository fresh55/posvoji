"use client";

import {
  CHOICE_CARD_MUTED,
  choiceCard,
  type ChoiceMeta,
} from "@/components/portal/portal-fields";
import { cn } from "@/lib/utils";

/**
 * One row of icon cards for a field with a small fixed set of answers. Every
 * such field in the editor is this component, so the rows cannot drift apart:
 * what differs between them is the options and their meta, not the markup.
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
  onPick: (value: Value) => void;
  disabled: boolean;
  /** The field's hint, so the group carries it as its description. */
  describedBy?: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      aria-describedby={describedBy}
      className="grid grid-cols-3 gap-1.5"
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
          <button
            key={option}
            type="button"
            aria-pressed={selected}
            disabled={disabled}
            onClick={() => onPick(option)}
            // Three columns in a dialog leave about 100px a card on a phone,
            // which "Uravnotežen" does not fit beside its icon. Stacked and
            // wrapping below sm, side by side once there is room; min-h so a
            // second line grows the card instead of being cut off.
            className={choiceCard(
              selected,
              cn(
                "min-h-11 flex-col gap-0.5 px-1.5 py-1.5 text-center text-xs leading-tight font-medium sm:flex-row sm:gap-1.5 sm:px-2",
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
          </button>
        );
      })}
    </div>
  );
}
