"use client";

import { useState } from "react";
import { MapAttribution } from "@/components/filters/map-attribution";
import {
  MunicipalityFinder,
  type FinderAnswer,
} from "@/components/filters/municipality-finder";
import { MUNICIPALITY_AT } from "@/components/filters/location-picker/municipality-places";
import { ShelterMap } from "@/components/filters/shelter-map";
import { useI18n } from "@/components/i18n-context";
import { RenderBoundary } from "@/components/render-boundary";
import type { ShelterPin } from "@/lib/map-layout";
import type { LookupEntry } from "@/lib/municipality-coverage";
import { cn } from "@/lib/utils";

/** Connect the lookup answer to a static reference map. The rem-based
 * container threshold stacks the map when the reader enlarges the text. */
export function FoundAnimalAtlas({
  entries,
  pins,
}: {
  entries: LookupEntry[];
  pins: ShelterPin[];
}) {
  const { messages } = useI18n();
  const [answer, setAnswer] = useState<FinderAnswer | null>(null);
  const from = answer
    ? (MUNICIPALITY_AT.get(answer.municipality) ?? null)
    : null;
  const spotlightNote = answer?.verified === false
    ? messages.muniNearestCallable
    : answer?.confirmed === false
      ? `${messages.muniResponsible} · ${messages.muniDatedShort}`
      : messages.muniResponsible;

  return (
    <div className="@container/atlas">
      <div className="grid gap-6 @min-[60rem]/atlas:grid-cols-[24rem_minmax(0,1fr)] @min-[60rem]/atlas:items-start @min-[60rem]/atlas:gap-column-gap">
        <div className="min-w-0">
          <MunicipalityFinder entries={entries} onAnswer={setAnswer} />
        </div>

        {/* A map failure must leave the finder and its contact actions usable. */}
        <RenderBoundary
          fallback={
            <p
              role="status"
              className={cn(
                "rounded-ui border bg-muted/40 p-4 text-sm leading-relaxed text-muted-foreground",
                !answer && "@max-[60rem]/atlas:hidden",
              )}
            >
              {messages.muniMapUnavailable}
            </p>
          }
        >
          {/* Keep the map mounted across breakpoints, but hide it until an
              answer exists in the stacked layout. map-stage lets map labels
              suppress unreadably small text; wide layouts keep the map sticky. */}
          <figure
            data-slot="map-plate"
            className={cn(
              "relative min-w-0 overflow-hidden rounded-ui border bg-muted/40 p-2 @container/map-stage sm:p-3 @min-[60rem]/atlas:sticky @min-[60rem]/atlas:top-6",
              !answer && "@max-[60rem]/atlas:hidden",
            )}
          >
            <figcaption className="px-2 pb-2 text-sm leading-relaxed text-muted-foreground">
              {messages.muniMapHelp}
            </figcaption>
            <ShelterMap
              interactive={false}
              className="@min-[60rem]/atlas:max-h-[calc(100dvh-6rem)]"
              shading="flat"
              pins={pins}
              // Keep the full fallback shortlist visible, but ring only the
              // callable shelter. Its note preserves the source's uncertainty.
              matchedValues={answer?.shelters ?? null}
              spotlightValues={answer?.spotlight ?? null}
              spotlightNote={spotlightNote}
              spotlightFrom={from}
            />
            <MapAttribution messages={messages} inFlow />
          </figure>
        </RenderBoundary>
      </div>
    </div>
  );
}
