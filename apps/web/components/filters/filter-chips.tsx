"use client";

import { X } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
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
  const { messages, t } = useI18n();
  if (chips.length === 0) return null;

  return (
    <section
      aria-label={messages.activeFilters}
      className={cn("flex items-center gap-2", className)}
    >
      <span className="hidden shrink-0 text-xs text-muted-foreground md:inline">
        {messages.activeFilters}
        <span aria-hidden className="ml-1 tabular-nums">
          {chips.length}
        </span>
      </span>

      <div className="min-w-0 flex-1 overflow-x-auto no-scrollbar">
        <div className="flex w-max items-center gap-1.5 sm:w-auto sm:flex-wrap">
          {chips.map(({ key, label, onRemove }) => (
            <span
              key={key}
              className="inline-flex h-7 shrink-0 items-center rounded-full border border-border bg-background pl-2.5 text-xs text-foreground"
            >
              {label}
              <button
                type="button"
                onClick={onRemove}
                aria-label={t("removeFilter", { label })}
                className="ml-0.5 grid size-6 place-items-center rounded-full text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                <X className="size-3" strokeWidth={2} aria-hidden />
              </button>
            </span>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={onClearAll}
        aria-label={messages.clearFilters}
        className="h-7 shrink-0 rounded-ui pr-0 pl-1.5 text-xs text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        {messages.clear}
      </button>
    </section>
  );
}
