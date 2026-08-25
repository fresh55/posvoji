"use client";

import { ArrowDownNarrowWide } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { QUIET_TRIGGER_CLASS } from "@/components/filters/toolbar-trigger";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ANIMAL_SORTS, type AnimalSort } from "@/lib/sort";
import { cn } from "@/lib/utils";

export function SortPicker({
  value,
  onChange,
  disabled = false,
  className,
}: {
  value: AnimalSort;
  onChange: (sort: AnimalSort) => void;
  disabled?: boolean;
  className?: string;
}) {
  const { messages } = useI18n();
  const labels: Record<AnimalSort, string> = {
    "longest-in-shelter": messages.sortLongestInShelter,
    "newest-arrivals": messages.sortNewestArrivals,
    youngest: messages.sortYoungest,
    oldest: messages.sortOldest,
    name: messages.sortName,
  };

  return (
    <Select
      value={value}
      disabled={disabled}
      onValueChange={(sort) => onChange(sort as AnimalSort)}
    >
      <SelectTrigger
        size="sm"
        // The name carries the active sort as well as the visible label does,
        // because this control is worth finding by either.
        aria-label={`${messages.sortBy}: ${labels[value]}`}
        className={cn(
          QUIET_TRIGGER_CLASS,
          "max-w-44 text-xs data-[state=open]:border-border max-lg:min-h-11",
          className,
        )}
      >
        <ArrowDownNarrowWide
          className="size-3.5 shrink-0 text-muted-foreground max-lg:size-4"
          aria-hidden
        />
        {/* The label used to go at max-sm, so a phone got an arrow and a
            chevron in a box and nothing saying what either did. That was to
            leave the species tabs beside it room to breathe; the tabs have
            had a row of their own since they stopped fitting one, and this
            control now sits alone in a row with two hundred spare pixels.
            Truncation, not hiding, is what a long sort name gets: max-w-44
            above keeps it from crowding the count at the other end. */}
        <SelectValue>
          <span className="truncate">{labels[value]}</span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent position="popper" align="end">
        {ANIMAL_SORTS.map((sort) => (
          <SelectItem key={sort} value={sort}>
            {labels[sort]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
