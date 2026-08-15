"use client";

import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export type Chip = { key: string; label: string; onRemove: () => void };

export function FilterChips({
  chips,
  onClearAll,
  className,
}: {
  chips: Chip[];
  onClearAll: () => void;
  className?: string;
}) {
  if (chips.length === 0) return null;

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {chips.map(({ key, label, onRemove }) => (
        <span
          key={key}
          className="inline-flex items-center gap-1 rounded-full bg-secondary py-0.5 pl-2.5 pr-1 text-xs text-secondary-foreground"
        >
          {label}
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Odstrani filter ${label}`}
            className="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
          >
            <X className="size-3" aria-hidden />
          </button>
        </span>
      ))}
      <button
        type="button"
        onClick={onClearAll}
        className="ml-1 text-xs text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
      >
        Počisti filtre
      </button>
    </div>
  );
}
