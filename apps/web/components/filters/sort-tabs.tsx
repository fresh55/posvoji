"use client";

import { Hourglass, Sparkles, type LucideIcon } from "lucide-react";
import { type Sort } from "@/lib/filters";
import { cn } from "@/lib/utils";

const SORTS: { value: Sort; label: string; icon: LucideIcon }[] = [
  { value: "novo", label: "Najnovejši", icon: Sparkles },
  { value: "cakanje", label: "Najdlje čaka", icon: Hourglass },
];

export function SortTabs({
  value,
  onChange,
  disabled = false,
  fullWidth = false,
}: {
  value: Sort;
  onChange: (sort: Sort) => void;
  disabled?: boolean;
  fullWidth?: boolean;
}) {
  return (
    <div className={cn("inline-flex gap-1", fullWidth && "flex w-full")}>
      {SORTS.map(({ value: sort, label, icon: Icon }) => (
        <button
          key={sort}
          type="button"
          onClick={() => onChange(sort)}
          disabled={disabled}
          aria-pressed={value === sort}
          aria-label={label}
          title={label}
          className={cn(
            "inline-flex items-center justify-center gap-1.5 rounded-md px-2 py-1 text-sm transition-colors disabled:opacity-40",
            fullWidth && "flex-1 py-1.5",
            value === sort
              ? "bg-foreground text-background"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Icon className="size-4" strokeWidth={1.75} aria-hidden />
          {/* Both labels beside the species tabs only fit once the sidebar
              takes over and the Filtri button goes away. */}
          <span className={cn(!fullWidth && "hidden lg:inline")}>{label}</span>
        </button>
      ))}
    </div>
  );
}
