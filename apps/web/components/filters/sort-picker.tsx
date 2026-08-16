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
        aria-label={messages.sortBy}
        className={cn("max-w-44 text-xs", className)}
      >
        <ArrowDownNarrowWide
          className="size-3.5 text-muted-foreground"
          aria-hidden
        />
        <SelectValue>{labels[value]}</SelectValue>
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
