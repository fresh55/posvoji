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
}: {
  /** Names the group for screen readers; the visible label sits above it. */
  label: string;
  options: readonly Value[];
  meta: Record<Value, ChoiceMeta>;
  value: Value | null;
  onPick: (value: Value) => void;
  disabled: boolean;
}) {
  return (
    <div role="group" aria-label={label} className="grid grid-cols-3 gap-1.5">
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
            className={choiceCard(
              selected,
              cn(
                "h-11 px-2 text-xs font-medium",
                selected && mutedWhenSelected && CHOICE_CARD_MUTED,
              ),
            )}
          >
            <Icon
              className={iconClass ?? "size-4"}
              strokeWidth={1.75}
              aria-hidden
            />
            <span className="truncate">{text}</span>
          </button>
        );
      })}
    </div>
  );
}
