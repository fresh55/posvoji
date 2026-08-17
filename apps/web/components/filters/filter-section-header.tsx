"use client";

import { Button } from "@/components/ui/button";
import { useI18n } from "@/components/i18n-provider";
import { cn } from "@/lib/utils";

/** Shared section heading and reset affordance for every filter group. */
export function FilterSectionHeader({
  label,
  active,
  onReset,
  resetAriaLabel,
  className,
}: {
  label: string;
  active: boolean;
  onReset: () => void;
  resetAriaLabel: string;
  className?: string;
}) {
  const { messages } = useI18n();

  return (
    <div
      className={cn(
        "mb-2 flex min-h-5 items-center justify-between gap-3",
        className,
      )}
    >
      <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </h3>
      <Button
        type="button"
        variant="link"
        size="xs"
        onClick={onReset}
        aria-hidden={!active}
        tabIndex={active ? undefined : -1}
        aria-label={resetAriaLabel}
        className={cn(
          "h-auto p-0 text-[11px] font-normal text-muted-foreground transition-opacity hover:text-foreground",
          !active && "pointer-events-none opacity-0",
        )}
      >
        {messages.resetFilters}
      </Button>
    </div>
  );
}
