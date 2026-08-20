"use client";

import { ExternalLink, Heart } from "lucide-react";
import type { Animal } from "@posvoji/schema";
import { useI18n } from "@/components/i18n-provider";
import { ShelterAvatar } from "@/components/shelter-avatar";
import type { ShelterLogos } from "@/lib/shelter-logos";
import { Button } from "@/components/ui/button";

// The logo-or-initial fallback lives in ShelterAvatar so one place decides it.
export function ShelterBlock({
  animal,
  logos,
}: {
  animal: Animal;
  logos: ShelterLogos;
}) {
  const { messages } = useI18n();
  const { shelter } = animal;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3 rounded-ui border bg-muted/40 p-4">
        <ShelterAvatar name={shelter.name} logo={logos[shelter.id]} />

        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{shelter.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {shelter.city}
          </p>
        </div>

        {/* An adopted animal has no listing worth sending anyone to, so the
            call to action gives way to the good news. */}
        {animal.status === "adopted" ? (
          // The listing still has to be reachable: every animal here names
          // its source and links back to it, adopted or not.
          <div className="flex w-full flex-col items-start gap-1.5 sm:w-auto">
            <p className="flex w-full items-center gap-2 rounded-ui border border-[var(--filter-accent-border)] bg-[var(--filter-accent)] px-3 py-2 text-xs text-[var(--filter-accent-foreground)]">
              <Heart className="size-4 shrink-0" aria-hidden />
              {messages.foundHome}
            </p>
            <a
              href={animal.source.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              {messages.viewOriginalListing}
              <ExternalLink className="size-3" aria-hidden />
            </a>
          </div>
        ) : (
          <Button asChild size="sm" className="w-full sm:w-auto">
            <a href={animal.source.sourceUrl} target="_blank" rel="noreferrer">
              {messages.viewOriginalListing}
              <ExternalLink aria-hidden />
            </a>
          </Button>
        )}
      </div>

      {/* The attribution stays a footnote under the box. In practice it
          repeats the shelter's name, and inside the box that read as the
          same line printed twice. */}
      <p className="text-xs text-muted-foreground/80">{animal.attribution}</p>
    </div>
  );
}
