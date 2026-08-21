"use client";

import { ArrowDownNarrowWide } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
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
        // The narrowest phones get the icon alone, to leave the species tabs
        // beside it room to breathe. The label is the only thing carrying
        // which sort is active, so it moves into the name rather than being
        // dropped: hiding it visually must not also silence it.
        aria-label={`${messages.sortBy}: ${labels[value]}`}
        className={cn(
          "max-w-44 text-xs max-lg:min-h-11 max-lg:justify-center max-lg:px-2.5",
          className,
        )}
      >
        <ArrowDownNarrowWide
          className="size-3.5 text-muted-foreground max-lg:size-4"
          aria-hidden
        />
        <SelectValue>
          <span className="max-sm:hidden">{labels[value]}</span>
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
