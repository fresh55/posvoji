"use client";

import { ArrowRight, PawPrint } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { requestMunicipalityLookup } from "@/lib/found-animal";

// The visible entry point for the other question people arrive with: not
// "which animal do I want" but "I found one, who takes it". One quiet line
// under the hero; the answer lives in the map dialog's municipality mode,
// which this opens directly.
export function FoundAnimalStrip() {
  const { messages } = useI18n();

  return (
    <button
      type="button"
      onClick={requestMunicipalityLookup}
      className="group flex w-full items-center justify-between gap-3 rounded-ui border bg-muted/40 px-4 py-2.5 text-left transition-colors hover:bg-muted/70"
    >
      <span className="flex min-w-0 items-center gap-2.5">
        <PawPrint className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className="text-sm text-muted-foreground">
          {messages.muniPrompt}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-1 text-sm font-medium underline-offset-4 group-hover:underline">
        {messages.muniPromptCta}
        <ArrowRight
          className="size-3.5 transition-transform group-hover:translate-x-0.5"
          aria-hidden
        />
      </span>
    </button>
  );
}
