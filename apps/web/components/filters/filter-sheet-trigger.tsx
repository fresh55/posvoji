import { SlidersHorizontal } from "lucide-react";
import { domAnimation } from "motion/react";
import { CountRoll } from "@/components/filters/filter-card";
import { LazyMotion } from "@/components/motion-scope";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/components/i18n-context";
import { cn } from "@/lib/utils";
import type { ComponentProps } from "react";

export function FilterSheetTrigger({
  activeCount,
  className,
  ...props
}: ComponentProps<typeof Button> & { activeCount: number }) {
  const { messages, t } = useI18n();
  return (
    <Button
      size="sm"
      {...props}
      aria-label={
        activeCount > 0
          ? t("filtersWithCount", { count: activeCount })
          : messages.filters
      }
      className={cn("h-11 gap-1.5 rounded-ui px-3", className)}
    >
      <SlidersHorizontal className="size-4" aria-hidden />
      {messages.filters}
      {activeCount > 0 && (
        <Badge
          variant="secondary"
          aria-hidden="true"
          className="h-5 min-w-5 rounded-full px-1 text-xs tabular-nums"
        >
          {/* The number rolls the way every count on the panel does. Its own
              LazyMotion, because the dock is drawn outside anything that
              opens one. */}
          <LazyMotion features={domAnimation}>
            <CountRoll value={activeCount} />
          </LazyMotion>
        </Badge>
      )}
    </Button>
  );
}
