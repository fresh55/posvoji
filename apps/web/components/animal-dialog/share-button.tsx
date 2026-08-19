"use client";

import { useEffect, useState } from "react";
import { Check, Share2 } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";

const CONFIRM_MS = 2000;

// What gets shared is the animal's own page, not the address bar. Both open
// the same animal, but only the page carries a link preview: the address bar
// deep link is a query on the index, and a query string cannot have its own
// title, description and card in a static export. Where the platform has no
// share sheet, the clipboard is the fallback, and where it has neither the
// button says so by doing nothing.
export function ShareButton({ path }: { path: string }) {
  const { messages } = useI18n();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), CONFIRM_MS);
    return () => window.clearTimeout(timer);
  }, [copied]);

  async function share() {
    const url = new URL(path, window.location.origin).toString();
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
