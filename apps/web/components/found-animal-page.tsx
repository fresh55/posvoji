import { Fragment } from "react";
import { FoundAnimalLookup } from "@/components/found-animal-lookup";
import { I18nProvider } from "@/components/i18n-provider";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { loadDataset } from "@/lib/dataset";
import { getMessages, type Locale } from "@/lib/i18n";
import { FOUND_ANIMAL_PATHS } from "@/lib/found-animal";
import {
  buildMunicipalityEntries,
  type LookupEntry,
} from "@/lib/municipality-coverage";
import { municipalityPath } from "@/lib/municipality-path";

// The found-animal flow as a page with a URL, which it never had. It lived
// only inside the homepage map dialog behind /?najdena -- a query parameter
// on a page whose title, description and OG card all say "adopt an animal".
// The person this flow exists for does not start from this site's homepage:
// they are standing over a stray, searching "našel sem psa kaj narediti" or
// the name of the nearest shelter, or reading a link someone pasted into a
// Facebook group. A dialog with no URL cannot be ranked for that search,
// cannot be linked from an občina's website in a form anyone would publish,
// and pastes into a group chat as an adoption ad. A route can.
//
// The dialog stays. On the homepage it is still the richer way in (it has the
// map), and /?najdena keeps opening it; this page is the same lookup for
// everyone who arrives from outside.
//
// One h1 and the lookup, nothing between them. The finder explains itself in
// its own empty state (muniHint), so an intro paragraph here would be the
// explanatory subtitle this site does not write. The cost answer and the
// what-now steps live inside the finder too, below the search, in the order
// the visitor needs them.
export function FoundAnimalPage({ locale }: { locale: Locale }) {
  const dataset = loadDataset();
  const entries = buildMunicipalityEntries(locale, dataset?.animals ?? []);
  const messages = getMessages(locale);
  const homeHref = locale === "sl" ? "/" : "/en";

  return (
    <I18nProvider locale={locale}>
      <div className="mx-auto flex min-h-full w-full max-w-7xl flex-col px-gutter">
        <SiteHeader
          githubTitle={messages.githubTitle}
          openSource={messages.openSource}
          canHelp={messages.canHelp}
          homeHref={homeHref}
          languagePaths={{
            sl: FOUND_ANIMAL_PATHS.sl,
            en: FOUND_ANIMAL_PATHS.en,
          }}
        />

        <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 py-page-y">
          <div className="space-y-5">
            <a
              href={homeHref}
              className="inline-flex max-lg:tap-target text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              ← {messages.backToAnimals}
            </a>
            <h1 className="text-balance text-xl font-medium tracking-tight sm:text-2xl md:text-3xl">
              {messages.muniPromptTitle}
            </h1>
          </div>

          <FoundAnimalLookup entries={entries} />

          {/* Slovenian only, because the per-municipality pages are. */}
          {locale === "sl" && (
            <MunicipalityIndex
              entries={entries}
              heading={messages.muniAllHeading}
            />
          )}
        </main>

        {/* The one footer that does not link to the found-animal page,
            because it is on it. */}
        <SiteFooter locale={locale} showFoundAnimalLink={false} />
      </div>
    </I18nProvider>
  );
}

/**
 * Every municipality's own page, as plain links a crawler can walk.
 *
 * The finder above reaches all 212 and reveals none of them: matches come out
 * of client state, so the shipped HTML names no municipality at all and the
 * static pages would sit in the sitemap with nothing on the site linking to
 * them. This is that link, and it is written to be read by whatever needs it
 * rather than looked at: one line per initial, names separated by the same
 * middot the cards use, at the size the source notes are set in.
 *
 * shrink-0 so it cannot take height from the finder. The column it sits in is
 * min-h-full rather than h-full, so once the two together outgrow the
 * viewport the page grows instead of the finder shrinking into its own
 * scroller.
 */
function MunicipalityIndex({
  entries,
  heading,
}: {
  entries: LookupEntry[];
  heading: string;
}) {
  if (entries.length === 0) return null;

  const names = entries
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, "sl"));

  // Grouped by initial, in the order the sort put them: Č, Š and Ž fall where
  // Slovenian puts them rather than after Z.
  const groups: { letter: string; names: string[] }[] = [];
  for (const name of names) {
    const letter = name.slice(0, 1).toLocaleUpperCase("sl");
    const last = groups.at(-1);
    if (last?.letter === letter) last.names.push(name);
    else groups.push({ letter, names: [name] });
  }

  return (
    <section className="shrink-0 space-y-2 border-t pt-6">
      <h2 className="text-xs font-medium text-muted-foreground">{heading}</h2>
      <div className="space-y-1">
        {groups.map((group) => (
          <p
            key={group.letter}
            className="flex gap-2 text-2xs leading-relaxed text-muted-foreground"
          >
            <span className="w-3 shrink-0 font-medium">{group.letter}</span>
            <span>
              {group.names.map((name, index) => (
                <Fragment key={name}>
                  {index > 0 && " · "}
                  <a
                    href={municipalityPath(name)}
                    className="underline-offset-4 hover:text-foreground hover:underline"
                  >
                    {name}
                  </a>
                </Fragment>
              ))}
            </span>
          </p>
        ))}
      </div>
    </section>
  );
}
