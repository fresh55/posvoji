"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useState, type MouseEvent } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const CONFIRM_MS = 2000;

/**
 * Copies one contact value, joined to the right edge of the link that prints
 * it.
 *
 * The link dials or opens a mail client, which on a desktop is rarely what
 * the visitor wants: they want the number on their phone or the address in
 * the mail tab they already have open. Text inside a link cannot be selected
 * with a drag either, because the drag moves the link.
 *
 * pointer-fine only. On a touch screen the link is the action and a long
 * press already offers the copy, so a second target beside it is a way to
 * miss the call.
 */
export function CopyContactButton({
  value,
  label,
  copiedLabel,
}: {
  value: string;
  /** The finished accessible name, value included. */
  label: string;
  copiedLabel: string;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), CONFIRM_MS);
    return () => window.clearTimeout(timer);
  }, [copied]);

  async function copy(event: MouseEvent<HTMLButtonElement>) {
    // Read before the await: React clears currentTarget once the handler
    // yields.
    const link = event.currentTarget.previousElementSibling;
    // The API is absent on a page served over plain http, and a browser may
    // refuse it. Nothing was copied then, so nothing says it was: the value
    // is selected instead, which leaves the copy one keystroke away.
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      if (link) window.getSelection()?.selectAllChildren(link);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      data-contact-copy
      onClick={copy}
      aria-label={label}
      title={label}
      className={cn(
        "-ml-px hidden h-auto w-9 rounded-l-none! px-0 text-muted-foreground pointer-fine:inline-flex",
        copied && "text-brand-strong hover:text-brand-strong",
      )}
    >
      {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
      {/* Mounted empty, because a live region has to be there before its
          text arrives. */}
      <span role="status" className="sr-only">
        {copied ? copiedLabel : null}
      </span>
    </Button>
  );
}
