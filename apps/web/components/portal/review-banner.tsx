"use client";

import {
  Check,
  ClipboardCheck,
  LoaderCircle,
  TriangleAlert,
} from "lucide-react";
import { fill, portalText } from "@/components/portal/portal-text";
import { Button } from "@/components/ui/button";
import type { PortalBulkState } from "@/hooks/use-portal-animals";
import { cn } from "@/lib/utils";

/** The mark in front of the sentence, once the run has something to report. */
function Mark({ icon: Icon }: { icon: typeof Check }) {
  return (
    <Icon
      aria-hidden
      strokeWidth={1.75}
      className="mr-1.5 inline size-4 align-[-0.2em]"
    />
  );
}

/**
 * One line above the list for every status the crawl read and the shelter has
 * not confirmed.
 *
 * The card used to say it per animal: the same sentence and the same "Potrdi"
 * on each of them, because almost every status comes from the crawl of the
 * shelter's own site. On a list of 150 that is the same sentence 150 times and
 * 150 taps for an answer that does not change a single value, only whose
 * answer it is. Said once here, with one button, it is the same work in one
 * gesture, and the row is left to say what it is actually about.
 *
 * It is a role="status" and not an alert: nothing is wrong, there is only
 * something left to do, and the progress it reports while it runs has to reach
 * a screen reader without taking focus off the button that started it.
 */
export function ReviewBanner({
  count,
  bulk,
  onConfirmAll,
}: {
  /** Animals whose status is still the crawl's reading. */
  count: number;
  bulk: PortalBulkState;
  onConfirmAll: () => void;
}) {
  // Nothing left to confirm and nothing left to report. The banner is gone
  // rather than empty, so the list starts where the tools end.
  if (count === 0 && bulk.status === "idle") return null;

  const running = bulk.status === "running";
  const done = bulk.status === "done";
  const failed = bulk.status === "failed";

  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-ui border bg-muted/30 px-3 py-2.5 text-sm"
    >
      <p
        className={cn(
          "min-w-0 flex-1",
          failed ? "text-destructive" : "text-muted-foreground",
        )}
      >
        {done && <Mark icon={Check} />}
        {failed && <Mark icon={TriangleAlert} />}
        {running
          ? // The string names its own second number {count}: here that is
            // the whole run, not what is left of it.
            fill(portalText.reviewBannerConfirming, {
              done: bulk.done,
              count: bulk.total,
            })
          : done
            ? portalText.reviewBannerDone
            : failed
              ? portalText.reviewBannerFailed
              : fill(portalText.reviewBannerLead, { count })}
      </p>
      {/* Once the run is through there is nothing left to press: the banner
          itself goes as soon as the hook drops back to idle. A failed run
          keeps the button, counting what is still unconfirmed, because the
          retry is the only way out of it. */}
      {!done && (
        <Button
          variant="outline"
          size="sm"
          disabled={running}
          onClick={onConfirmAll}
        >
          {running ? (
            <LoaderCircle className="animate-spin" aria-hidden />
          ) : (
            <ClipboardCheck aria-hidden />
          )}
          {fill(portalText.reviewBannerConfirm, { count })}
        </Button>
      )}
    </div>
  );
}
