"use client";

import { useEffect, useState } from "react";
import { Check, Share2 } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";

const CONFIRM_MS = 2000;

// The URL already carries the open animal, so sharing is just handing over
// the address bar. Where the platform has no share sheet, the clipboard is
// the fallback, and where it has neither the button says so by doing nothing.
export function ShareButton() {
  const { messages } = useI18n();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), CONFIRM_MS);
    return () => window.clearTimeout(timer);
  }, [copied]);

  async function share() {
    const url = window.location.href;
    if (typeof navigator === "undefined") return;
    try {
      if (navigator.share) {
        await navigator.share({ url });
        return;
      }
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        setCopied(true);
      }
    } catch {
      // A cancelled share sheet is not a failure worth reporting.
    }
  }

  return (
    <span className="relative inline-flex">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={share}
        aria-label={messages.share}
      >
        {copied ? (
          <Check className="size-4 text-[var(--filter-accent-strong)]" aria-hidden />
        ) : (
          <Share2 className="size-4" aria-hidden />
        )}
      </Button>
      {copied && (
        <span
          role="status"
          className="absolute top-full right-0 z-10 mt-1 rounded-ui border bg-popover px-2 py-1 text-xs whitespace-nowrap text-popover-foreground shadow-xs"
        >
          {messages.linkCopied}
        </span>
      )}
    </span>
  );
}
