import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { I18nProvider } from "@/components/i18n-provider";
import {
  AnswerSteps,
  CostNote,
  CoverageLine,
  coverageCardText,
  NoCoverageAnswer,
} from "@/components/municipality-answer";
import { CoverageCard } from "@/components/municipality-coverage-card";
import { DETAIL_TITLE_CLASS, PageShell } from "@/components/page-shell";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { loadDataset } from "@/lib/dataset";
import { FOUND_ANIMAL_PATHS } from "@/lib/found-animal";
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
// with the name in it, and the shelter card, the cost block, the register
// fallback, the nearest list and the numbered steps are the same components
// the finder renders, out of components/municipality-answer.tsx.

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
  const cardText = coverageCardText(messages);

  return (
    <I18nProvider locale="sl">
      <PageShell>
        <SiteHeader
          locale="sl"
          homeHref="/"
          // The English side of the switcher is the interactive lookup, which
          // is the nearest thing to this page that exists in English.
          languagePaths={{
            sl: municipalityPath(entry.name),
            en: FOUND_ANIMAL_PATHS.en,
          }}
        />

        {/* The same measure the found-animal page holds itself to, and the
            same reason it is not centred: the column starts on the frame's
            left edge, so the h1 lines up with the logo. */}
        <main className="flex w-full max-w-xl flex-1 flex-col gap-6 py-page-y">
          <div className="space-y-5">
            {/* Back to the finder, not to the animals: somebody who landed
                here from a search for the wrong občina wants the box. */}
            <a
              href={FOUND_ANIMAL_PATHS.sl}
              className="inline-flex max-lg:tap-target text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              ← {messages.muniOtherMunicipalities}
            </a>
            <h1 className={DETAIL_TITLE_CLASS}>
              {translate("sl", "muniPageHeading", { name: entry.name })}
            </h1>
          </div>

          <div className="space-y-3">
            <CoverageLine entry={entry} messages={messages} />

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
              <NoCoverageAnswer entry={entry} messages={messages} />
            )}

            <CostNote messages={messages} />

            <AnswerSteps messages={messages} />
          </div>
        </main>

        {/* Same as the found-animal page: this is the found-animal flow, so
            the footer does not offer a link back into it. */}
        <SiteFooter locale="sl" showFoundAnimalLink={false} />
      </PageShell>
    </I18nProvider>
  );
}
