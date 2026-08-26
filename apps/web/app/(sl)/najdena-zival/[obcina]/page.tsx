import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ExternalLink, Phone } from "lucide-react";
import { I18nProvider } from "@/components/i18n-provider";
import {
  CoverageCard,
  type CoverageCardText,
} from "@/components/municipality-coverage-card";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { loadDataset } from "@/lib/dataset";
import { FOUND_ANIMAL_PATHS } from "@/lib/found-animal";
import {
  ANIMAL_PROTECTION_ACT_URL,
  SHELTER_REGISTER_URL,
} from "@/lib/found-animal-sources";
import { getMessages, translate } from "@/lib/i18n";
import {
  buildMunicipalityEntries,
  type LookupEntry,
} from "@/lib/municipality-coverage";
import { loadMunicipalities } from "@/lib/municipalities";
import {
  findMunicipalityBySlug,
  municipalityPath,
  municipalitySlug,
} from "@/lib/municipality-path";
import { municipalityMetadata } from "@/lib/municipality-share";

// One page per občina, holding the answer the finder gives for it, already
// rendered.
//
// The finder is the better way to ask the question and the worse way to be
// found asking it: 212 answers behind one address, none of which a search
// engine can rank for the name of a municipality, and none of which an
// občina's own website can link to in a form that says which municipality it
// is about. These pages are that form. Slovenian only, and lib/
// municipality-path.ts says why.
//
// Nothing here is new design. The heading is the finder's own muniPromptTitle
// with the name in it, the shelter is the same CoverageCard the finder
// renders, and the cost block, the register fallback, the nearest list and
// the numbered steps are the same markup and the same strings, copied out of
// components/filters/municipality-finder.tsx because that file is a client
// component whose state none of this needs.

export function generateStaticParams() {
  return loadMunicipalities().municipalities.map((municipality) => ({
    obcina: municipalitySlug(municipality.name),
  }));
}

export const dynamicParams = false;

// Cached for the life of the process, the way loadDataset and loadShelters
// are: the registries cannot change while pages are being rendered, and this
// is asked for twice per page across 212 pages.
let entries: LookupEntry[] | undefined;

// Built from the same join the page renders, so the description names the
// same shelter the page does.
function entryFor(slug: string): LookupEntry | undefined {
  entries ??= buildMunicipalityEntries("sl", loadDataset()?.animals ?? []);
  return findMunicipalityBySlug(entries, slug);
}

export async function generateMetadata({
  params,
}: PageProps<"/najdena-zival/[obcina]">): Promise<Metadata> {
  const { obcina } = await params;
  const entry = entryFor(obcina);
  if (!entry) return {};
  return municipalityMetadata(entry);
}

export default async function NajdenaZivalObcina({
  params,
}: PageProps<"/najdena-zival/[obcina]">) {
  const { obcina } = await params;
  const entry = entryFor(obcina);
  // Unreachable with dynamicParams off, and the narrowing the rest needs.
  if (!entry) notFound();

  const messages = getMessages("sl");
  const cardText: CoverageCardText = {
    dogs: messages.speciesDogs,
    cats: messages.speciesCats,
    call: messages.muniCall,
    onSite: messages.muniOnSite,
    lost: messages.muniLost,
    sourcePrefix: messages.muniSource,
    datedSourceNote: messages.muniDatedSource,
  };

  return (
    <I18nProvider locale="sl">
      <div className="mx-auto flex min-h-full w-full max-w-7xl flex-col px-gutter">
        <SiteHeader
          githubTitle={messages.githubTitle}
          openSource={messages.openSource}
          canHelp={messages.canHelp}
          homeHref="/"
          // The English side of the switcher is the interactive lookup, which
          // is the nearest thing to this page that exists in English.
          languagePaths={{
            sl: municipalityPath(entry.name),
            en: FOUND_ANIMAL_PATHS.en,
          }}
        />

        <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 py-page-y">
          <div className="space-y-5">
            {/* Back to the finder, not to the animals: somebody who landed
                here from a search for the wrong občina wants the box. */}
            <a
              href={FOUND_ANIMAL_PATHS.sl}
              className="inline-flex max-lg:tap-target text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              ← {messages.muniOtherMunicipalities}
            </a>
            <h1 className="text-balance text-xl font-medium tracking-tight sm:text-2xl md:text-3xl">
              {translate("sl", "muniPageHeading", { name: entry.name })}
            </h1>
          </div>

          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              {entry.name} ·{" "}
              {entry.coverage.length === 1
                ? messages.muniResponsible
                : entry.coverage.length > 1
                  ? messages.muniResponsiblePlural
                  : messages.muniUnverified}
            </p>

            {entry.coverage.length > 0 ? (
              entry.coverage.map((coverage) => (
                <CoverageCard
                  key={`${coverage.shelterId}-${coverage.species ?? "all"}`}
                  coverage={coverage}
                  text={cardText}
                  locale="sl"
                />
              ))
            ) : (
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
                    <p className="text-xs font-medium">
                      {messages.muniNearestTitle}
                    </p>
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
            )}

            {/* The fact that stops people reporting a found animal: they
                assume the vet bill is theirs. It is not. */}
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

            <div className="space-y-1.5">
              <p className="text-xs font-medium">{messages.muniStepsTitle}</p>
              <ol className="space-y-1.5">
                {[
                  messages.muniStep1,
                  messages.muniStep2,
                  messages.muniStep3,
                ].map((step, index) => (
                  <li
                    key={step}
                    className="flex gap-2 text-xs leading-relaxed text-muted-foreground"
                  >
                    <span className="shrink-0 font-medium text-foreground">
                      {index + 1}.
                    </span>
                    {step}
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </main>

        {/* Same as the found-animal page: this is the found-animal flow, so
            the footer does not offer a link back into it. */}
        <SiteFooter locale="sl" showFoundAnimalLink={false} />
      </div>
    </I18nProvider>
  );
}
