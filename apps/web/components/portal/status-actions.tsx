"use client";

import { useEffect, useState } from "react";
import { m, useReducedMotion } from "motion/react";
import {
  CHOICE_CARD_INHERITED,
  STATUS_META,
  choiceCard,
} from "@/components/portal/portal-fields";
import { portalText } from "@/components/portal/portal-text";
import { PORTAL_STATUSES, type PortalStatus } from "@/lib/portal-api";
import { cn } from "@/lib/utils";

const POP_MS = 520;

// The four statuses are the daily work, so they are one tap on the card
// itself rather than a field inside a form. Icon first: staff scan the row
// for the shape, not for the word.
//
// h-9, not the h-11 this started at. A shelter with 185 cats scrolls this row
// 185 times, and the height it was costing is worth more to the line under it
// naming the fields no crawl can fill.
const BUTTON_LAYOUT = "h-9 flex-1 px-2 text-xs font-medium focus-visible:z-10";

export function StatusActions({
  value,
  source,
  busy = false,
  onSelect,
}: {
  value: PortalStatus | null;
  /**
   * Whose answer `value` is. "site" is the crawl's reading of the shelter's
   * own page, drawn as inherited rather than as a choice the shelter made.
   * Required on purpose: a forgotten prop would present the crawl's reading
   * as the shelter's answer, which is what this exists to prevent.
   */
  source: "shelter" | "site";
  busy?: boolean;
  onSelect: (status: PortalStatus) => void;
}) {
  const shouldReduceMotion = useReducedMotion();
  // Only a tap pops. A status that arrives from the server on load must not
  // animate as if the shelter had just picked it.
  const [popped, setPopped] = useState<PortalStatus | null>(null);

  useEffect(() => {
    if (!popped) return;
    const timer = window.setTimeout(() => setPopped(null), POP_MS);
    return () => window.clearTimeout(timer);
  }, [popped]);

  return (
    <div
      role="group"
      aria-label={portalText.statusLegend}
      // Four across is decided by how wide this row actually is, not by how
      // wide the window is. The row is drawn full width on the list and in a
      // 288px column beside the editor's form, and at four columns there
      // "Rezerviran" came out as "Re…". StatusBlock is the container.
      className="grid grid-cols-2 gap-1.5 @md:grid-cols-4"
    >
      {PORTAL_STATUSES.map((status) => {
        const meta = STATUS_META[status];
        const Icon = meta.icon;
        const current = value === status;
        const chosen = current && source === "shelter";
        const inherited = current && source === "site";
        const popping = popped === status && current;

        return (
          <button
            key={status}
            type="button"
            aria-pressed={current}
            disabled={busy}
            onClick={() => {
              // An inherited value is not a choice yet, so tapping the one the
              // site already says is a real edit: the shelter is confirming
              // it, which stops the crawl from moving the value later.
              if (chosen) return;
              setPopped(status);
              onSelect(status);
            }}
            className={choiceCard(
              chosen,
              cn(
                BUTTON_LAYOUT,
                chosen && meta.selected,
                inherited && CHOICE_CARD_INHERITED,
              ),
            )}
          >
            <m.span
              aria-hidden
              className="flex items-center justify-center"
              initial={false}
              animate={
                shouldReduceMotion || !popping
                  ? { scale: 1, rotate: 0 }
                  : { scale: [1, 1.22, 1], rotate: [0, -6, 0] }
              }
              transition={{ duration: 0.42, ease: "easeOut" }}
            >
              <Icon className="size-4" strokeWidth={1.75} />
            </m.span>
            <span className="truncate">{meta.label}</span>
          </button>
        );
      })}
    </div>
  );
}
