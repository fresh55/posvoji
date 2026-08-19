"use client";

import { useEffect, useState } from "react";
import { m, useReducedMotion } from "motion/react";
import { STATUS_META, choiceCard } from "@/components/portal/portal-fields";
import { portalText } from "@/components/portal/portal-text";
import { PORTAL_STATUSES, type PortalStatus } from "@/lib/portal-api";
import { cn } from "@/lib/utils";

const POP_MS = 520;

// The four statuses are the daily work, so they are one tap on the card
// itself rather than a field inside a form. Icon first: staff scan the row
// for the shape, not for the word.
const BUTTON_LAYOUT = "h-11 flex-1 px-2 text-xs font-medium focus-visible:z-10";

export function StatusActions({
  value,
  busy = false,
  onSelect,
}: {
  value: PortalStatus | null;
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
      className="grid grid-cols-2 gap-1.5 sm:grid-cols-4"
    >
      {PORTAL_STATUSES.map((status) => {
        const meta = STATUS_META[status];
        const Icon = meta.icon;
        const selected = value === status;
        const popping = popped === status && selected;

        return (
          <button
            key={status}
            type="button"
            aria-pressed={selected}
            disabled={busy}
            onClick={() => {
              if (selected) return;
              setPopped(status);
              onSelect(status);
            }}
            className={choiceCard(
              selected,
              cn(BUTTON_LAYOUT, selected && meta.selected),
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
