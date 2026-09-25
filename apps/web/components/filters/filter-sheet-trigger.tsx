import { SlidersHorizontal } from "lucide-react";
import {
  AnimatePresence,
  domAnimation,
  m,
  useReducedMotion,
} from "motion/react";
import {
  COUNT_BADGE_MOTION,
  CountRoll,
} from "@/components/filters/filter-card";
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
  const shouldReduceMotion = useReducedMotion();
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
      {/* The number rolls the way every count on the panel does, and the
          badge comes and goes the way the sidebar's does: it vanished in one
          frame when the last filter came off. Its own LazyMotion, because the
          dock is drawn outside anything that opens one. transition-none for
          the reason the sidebar gives: the badge's own CSS transition would
          lag a frame behind Motion's. */}
      <LazyMotion features={domAnimation}>
        <AnimatePresence initial={false}>
          {activeCount > 0 && (
            <Badge
              key="count"
              asChild
              variant="secondary"
              aria-hidden="true"
              className="h-5 min-w-5 rounded-full px-1 text-xs tabular-nums transition-none"
            >
              <m.span
                initial={COUNT_BADGE_MOTION.hidden}
                animate={COUNT_BADGE_MOTION.shown}
                exit={COUNT_BADGE_MOTION.hidden}
                transition={
                  shouldReduceMotion ? { duration: 0 } : COUNT_BADGE_MOTION.fade
                }
              >
                <CountRoll value={activeCount} />
              </m.span>
            </Badge>
          )}
        </AnimatePresence>
      </LazyMotion>
    </Button>
  );
}
