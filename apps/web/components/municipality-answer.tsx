import { ExternalLink, Phone } from "lucide-react";
import type { CoverageCardText } from "@/components/municipality-coverage-card";
import {
  ANIMAL_PROTECTION_ACT_URL,
  SHELTER_REGISTER_URL,
} from "@/lib/found-animal-sources";
import type { Messages } from "@/lib/i18n";
import type { LookupEntry } from "@/lib/municipality-coverage";

// The parts of a found-animal answer that are the same wherever the answer is
// given: who is responsible, what to do when nobody is, what it costs, and the
// steps. Two surfaces render them, the finder in components/filters/
// municipality-finder.tsx and the static page for one občina, and they used to
// render them from two copies of the same markup.
//
// No "use client" here on purpose. Nothing below holds state or reads the
// browser, so the static pages render it on the server with no JavaScript and
// the finder pulls the same module into its client bundle. That is what both
// files already do with CoverageCard, in the other direction.
//
// The builder and the label helper live here rather than in the two files the
// review pointed at, and the reason is the same in both cases:
// lib/municipality-coverage.ts reads the registries with node:fs and cannot be
// imported for a value by a client component, and every export of the "use
// client" module municipality-coverage-card.tsx is a client reference that a
// server component may render but not call.

/** The 7 strings CoverageCard needs, out of the message catalogue. */
export function coverageCardText(messages: Messages): CoverageCardText {
  return {
    dogs: messages.speciesDogs,
    cats: messages.speciesCats,
    call: messages.muniCall,
    onSite: messages.muniOnSite,
    lost: messages.muniLost,
    sourcePrefix: messages.muniSource,
    datedSourceNote: messages.muniDatedSource,
  };
}

/** What the entry's coverage amounts to, in one phrase: one shelter, several,
 *  or none we have verified. Said in three places, two of them visible and one
 *  of them the finder's sr-only status. */
export function coverageLabel(entry: LookupEntry, messages: Messages): string {
  if (entry.coverage.length === 1) return messages.muniResponsible;
  if (entry.coverage.length > 1) return messages.muniResponsiblePlural;
  return messages.muniUnverified;
}

/** The municipality and what its coverage amounts to, above the answer. */
export function CoverageLine({
  entry,
  messages,
}: {
  entry: LookupEntry;
  messages: Messages;
}) {
  return (
    <p className="text-xs text-muted-foreground">
      {entry.name} · {coverageLabel(entry, messages)}
    </p>
  );
}

/** Shown instead of the shelter cards when no shelter is verified for the
 *  municipality: where to ask, and the nearest numbers to try meanwhile. */
export function NoCoverageAnswer({
  entry,
  messages,
}: {
  entry: LookupEntry;
  messages: Messages;
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-1.5 rounded-ui border border-dashed p-4 text-sm text-muted-foreground">
        <p>{messages.muniUnverifiedAdvice}</p>
        <a
          href={SHELTER_REGISTER_URL}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-xs underline underline-offset-2 hover:text-foreground"
        >
          {messages.muniRegister}
          <ExternalLink className="size-3" aria-hidden />
        </a>
      </div>

      {/* Not an answer, but better than none: somewhere to call. */}
      {entry.nearest.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium">{messages.muniNearestTitle}</p>
          <p className="text-2xs leading-tight text-muted-foreground">
            {messages.muniNearestNote}
          </p>
          <ul className="space-y-0.5 pt-0.5">
            {entry.nearest.map((shelter) => (
              <li
                key={shelter.shelterId}
                className="flex items-center justify-between gap-2 rounded-ui px-2 py-1.5 text-sm"
              >
                <span className="min-w-0">
                  <a
                    href={shelter.detailHref}
                    className="block truncate underline-offset-4 hover:underline"
                  >
                    {shelter.shelterName}
                  </a>
                  <span className="block truncate text-2xs text-muted-foreground">
                    {shelter.city} · {shelter.km} km
                  </span>
                </span>
                {shelter.phone && (
                  <a
                    href={`tel:${shelter.phone.replace(/\s/g, "")}`}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-ui border px-2 py-1 text-xs transition-colors hover:bg-muted max-lg:min-h-11 max-lg:px-3"
                  >
                    <Phone className="size-3" aria-hidden />
                    {shelter.phone}
                  </a>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** The fact that stops people reporting a found animal: they assume the vet
 *  bill is theirs. It is not. */
export function CostNote({ messages }: { messages: Messages }) {
  return (
    <div className="space-y-1 rounded-ui border bg-muted/40 p-3">
      <p className="text-xs leading-relaxed">{messages.muniCost}</p>
      <a
        href={ANIMAL_PROTECTION_ACT_URL}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 text-2xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
      >
        {messages.muniCostSource}
        <ExternalLink className="size-2.5" aria-hidden />
      </a>
    </div>
  );
}

/** What to do next, numbered. */
export function AnswerSteps({ messages }: { messages: Messages }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium">{messages.muniStepsTitle}</p>
      <ol className="space-y-1.5">
        {[messages.muniStep1, messages.muniStep2, messages.muniStep3].map(
          (step, index) => (
            <li
              key={step}
              className="flex gap-2 text-xs leading-relaxed text-muted-foreground"
            >
              <span className="shrink-0 font-medium text-foreground">
                {index + 1}.
              </span>
              {step}
            </li>
          ),
        )}
      </ol>
    </div>
  );
}
