"use client";

import { Cat, Dog, Globe, Mail, MapPin, Phone, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { LookupCoverage } from "@/lib/municipality-coverage";
import { animalCount } from "@/lib/labels";
import type { Locale } from "@/lib/i18n";

export type CoverageCardText = {
  dogs: string;
  cats: string;
  call: string;
  onSite: string;
  lost: string;
  sourcePrefix: string;
  datedSourceNote: string;
};

function SpeciesTag({
  species,
  text,
}: {
  species: LookupCoverage["species"];
  text: CoverageCardText;
}) {
  if (!species) return null;
  const Icon = species === "dogs" ? Dog : Cat;
  return (
    <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-2xs text-muted-foreground">
      <Icon className="size-3" aria-hidden />
      {species === "dogs" ? text.dogs : text.cats}
    </span>
  );
}

// One shelter's answer to "who takes the animal found in my municipality".
// The flow ends in a phone call, so the number is the primary control rather
// than one more line of contact details.
export function CoverageCard({
  coverage,
  text,
  locale,
  action,
}: {
  coverage: LookupCoverage;
  text: CoverageCardText;
  locale: Locale;
  /** Optional control the host mounts under the card, e.g. "select this
   *  shelter as a filter" inside the map dialog. */
  action?: React.ReactNode;
}) {
  return (
    <div className="space-y-3 rounded-ui border bg-card p-4 shadow-xs">
      <div className="flex flex-wrap items-center gap-2">
        <a
          href={coverage.detailHref}
          className="font-medium underline-offset-4 hover:underline"
        >
          {coverage.shelterName}
        </a>
        <SpeciesTag species={coverage.species} text={text} />
      </div>

      {coverage.phone && (
        <Button asChild className="w-full">
          <a href={`tel:${coverage.phone.replace(/\s/g, "")}`}>
            <Phone className="size-4 shrink-0" aria-hidden />
            {text.call.replace("{phone}", coverage.phone)}
          </a>
        </Button>
      )}

      <ul className="space-y-1.5 text-sm text-muted-foreground">
        <li className="flex items-center gap-2">
          <MapPin className="size-3.5 shrink-0" aria-hidden />
          {coverage.city}
        </li>
        {coverage.email && (
          <li className="flex items-center gap-2">
            <Mail className="size-3.5 shrink-0" aria-hidden />
            <a
              href={`mailto:${coverage.email}`}
              className="truncate underline-offset-4 hover:text-foreground hover:underline"
            >
              {coverage.email}
            </a>
          </li>
        )}
        {coverage.website && (
          <li className="flex items-center gap-2">
            <Globe className="size-3.5 shrink-0" aria-hidden />
            <a
              href={coverage.website}
              target="_blank"
              rel="noreferrer"
              className="truncate underline-offset-4 hover:text-foreground hover:underline"
            >
              {coverage.website
                .replace(/^https?:\/\/(www\.)?/, "")
                .replace(/\/$/, "")}
            </a>
          </li>
        )}
      </ul>

      {action}

      {/* The same lookup answers the opposite question, and the answer to that
          one is data this site already has: the shelter's current animals. */}
      {coverage.animals > 0 && (
        <a
          href={coverage.detailHref}
          className="flex items-center gap-1.5 border-t pt-3 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          <Search className="size-3.5 shrink-0" aria-hidden />
          {text.lost}
          <span className="text-muted-foreground">
            ({animalCount(coverage.animals, locale)})
          </span>
        </a>
      )}

      <p className="text-2xs leading-tight text-muted-foreground">
        {text.sourcePrefix}{" "}
        {coverage.sourceUrl ? (
          <a
            href={coverage.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2 hover:text-foreground"
          >
            {coverage.sourceLabel}
          </a>
        ) : (
          coverage.sourceLabel
        )}{" "}
        ({coverage.sourceDate}).
        {!coverage.confirmed && <> {text.datedSourceNote}</>}
      </p>
    </div>
  );
}
