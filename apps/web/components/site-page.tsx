import { clientPayload } from "@/lib/client-payload";
import { AnimalGrid } from "@/components/animal-grid";
import { FoundAnimalButton } from "@/components/found-animal-button";
import { FoundAnimalRedirect } from "@/components/found-animal-redirect";
import { CAT_CORNER, HomeCat } from "@/components/home-cat";
import { NewListingsScript } from "@/components/new-listings-script";
import { SiteFooter } from "@/components/site-footer";
import { SiteShell } from "@/components/site-shell";
import { adoptableNow, listedAtTime, type ClientAnimal } from "@/lib/animal";
import { animalsForClient, loadDataset } from "@/lib/dataset";
import { getMessages, type Locale } from "@/lib/i18n";
import { byShelterName, shelterCount } from "@/lib/labels";
import { verificationDate } from "@/lib/source-freshness";
import { buildMunicipalityEntries } from "@/lib/municipality-coverage";
import { getShelterLogos } from "@/lib/shelter-logos";
import { loadShelters } from "@/lib/shelters";

/** The time the newest animal the notice would count was first listed, in
 *  the unit it counts in (listedAtTime), or undefined when none carries one.
 *  Adoptable ones only, the rule the notice counts by (isNewsToVisitor in
 *  hooks/use-last-visit.ts): measured over every animal, a new intake on hold
 *  held a place the notice then left empty. */
function newestListing(animals: readonly ClientAnimal[]): number | undefined {
  let newest: number | undefined;
  for (const { listedAt, status } of animals) {
    if (listedAt === undefined || !adoptableNow(status)) continue;
    const time = listedAtTime(listedAt);
    if (newest === undefined || time > newest) newest = time;
  }
  return newest;
}

export function SitePage({ locale }: { locale: Locale }) {
  const dataset = loadDataset();
  const animals = dataset?.animals ?? [];
  const municipalities = buildMunicipalityEntries(locale, animals);
  const onSiteIds = new Set(animals.map((animal) => animal.shelter.id));
  const shelters = onSiteIds.size;
  // Registry shelters with no animals on the site. The location picker shows
  // them as inert markers and rows, so the map answers "where are Slovenia's
  // shelters" and not just "where are ours".
  const offSiteShelters = loadShelters()
    .filter((shelter) => !onSiteIds.has(shelter.id))
    .map((shelter) => ({
      value: shelter.id,
      label: shelter.name,
      city: shelter.city,
    }))
    // The order the picker's own rows read in.
    .sort(byShelterName);
  const messages = getMessages(locale);
  // Read once: the hero row and the footer both ask it, and they must not
  // drift into two different answers about whether the lookup exists.
  const hasLookup = municipalities.length > 0;
  const gridAnimals = animalsForClient(animals, { deferPhotos: true });

  return (
    <SiteShell
      locale={locale}
      // The animal grid is the one thing on this site that is better for
      // having room: at 1920 the page used to draw three cards in a 1280px
      // column and leave 320px of empty page on each side.
      wide
      mainClassName="flex flex-1 flex-col gap-section-gap py-page-y"
      // /?najdena, which municipality websites published back when the lookup
      // was a mode of the map dialog. It draws nothing; it sends those
      // visitors on to the page the flow lives on.
      before={<FoundAnimalRedirect locale={locale} />}
      // The one page that floats the filter dock, so the one footer that has
      // to duck under it. It is also the one page that already knows whether
      // the coverage table has anything in it, so it answers for the
      // found-animal link rather than taking the default.
      //
      // The freshness line as well as the hero's, and the two are not a
      // duplication in any way a reader can see: the hero is at the top of a
      // document that runs about 67,000px, and this is at the end of it. Both
      // read the same timestamp, and this is the one that spends the words on
      // it: the footer prints the minute and the timezone (verificationTime),
      // the hero the date alone (verificationDate). The provenance with the
      // hour in it belongs at the end of the document, where somebody is
      // asking how the list is made; at the top the question is only whether
      // it is current.
      footer={
        <SiteFooter
          locale={locale}
          showFoundAnimalLink={hasLookup}
          updatedAt={dataset?.generatedAt}
          docked
        />
      }
    >
      {/* relative, for the cat (home-cat.tsx): he is drawn out of flow in
          the corner above the toolbar, so this row keeps its 64px and the
          heading keeps its place. The right padding from md keeps a wrapped
          title out from under him, and it is his own measurement rather than
          a number of its own (CAT_CORNER). That is also how the padding
          leaves when he does: on the landscape phone he is not drawn, the
          corner there is zero, and the one statement covers both. Held at
          844x390 with the full corner it kept the title in a 572px column,
          which wrapped the heading and the meta line and pushed the species
          tabs down into the fixed dock. */}
      <div className={`relative space-y-1.5 md:pr-(--cat-corner) ${CAT_CORNER}`}>
        {/* 600, which is the weight of the card names in the grid under it
            and the weight every page title on the site now carries. At 500
            the title was the lighter of the two, so the page was headed by
            something quieter than the rows it introduces.

            short:text-xl puts the phone's own title size back on a screen 360
            to 430 pixels tall. The step the widths buy is width, not height,
            and a phone held sideways has the first and none of the second: at
            30px this sentence took two lines of a screen with room for about
            six, and beside the cat it still did on the narrower ones. The
            same string without this last utility is on found-animal-page.tsx;
            the two are no longer meant to match, because that page has no
            dock under it and no drawing beside the title.

            One step under PAGE_TITLE at every width, on purpose. This is the
            one title with a drawing beside it, and the rule that seats him
            (home-cat.tsx) is that the hero stays a heading and one line. At
            the site's own size, measured 2026-09-17, the English title took
            two lines at 1024 beside the cat and three at 320, and the
            Slovenian one two at 834. The entry page is the quietest title on
            the site because it is the one the photographs have to outrank. */}
        <h1 className="text-balance text-xl font-semibold tracking-tight sm:text-2xl md:text-3xl short:text-xl">
          {messages.heroTitle}
        </h1>
        {/* One wrapping line at every width, where this used to be a text
            line with a full-width button stacked under it. It carries both
            things the page has to say about itself: what is in it, and the
            way out for someone who found an animal rather than wants one.
            The second of those spent a whole horizontal rule of page on
            the smaller of the two questions for as long as it was a block;
            now that it is a line too (found-animal-button.tsx), the two
            fit together and the hero is a heading and one line.

            Siblings with their own gates, and not one sentence. The meta
            line needs a dataset, the way out needs a coverage table, and
            folded into a single paragraph the found-animal link would have
            disappeared every time the freshness line did. Only the
            separator needs both, so it is the only part that asks for
            both.

            flex-wrap, and the link renders in foreground ink with a
            standing underline while the meta line stays muted. Sharing one
            grey row, the link read as a second line of metadata on the
            375px wrap -- and the person it exists for is scanning the top
            of the page for something to act on, not reading captions. The
            voice difference separates them better than the middot that
            used to sit here and dangled at the wrap. */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
          {dataset && shelters > 0 && (
            // The date and not the minute. The hour and the timezone are the
            // list's provenance and they are printed once, at the end of the
            // document, by the footer that reads the same timestamp through
            // verificationTime; up here the question is whether the list is
            // current, which a date answers and ", 21:45 (Ljubljana)" only
            // lengthens. Measured: the line went from 404px to 288px, so it
            // fits one line from 360 up where it wrapped to two on every
            // phone, which is 20px of the page above the fold.
            <p>
              {shelterCount(shelters, locale)} · {messages.listPublished}{" "}
              {verificationDate(dataset.generatedAt, locale)}
            </p>
          )}
          {/* One link in this row, and it is the one addressed to somebody
              with a problem. The cat's link was the other and is his caption
              now (home-cat.tsx): as a row item it competed with this one for
              the same press, and wherever the row wrapped it came to rest
              diagonally below it. Under him it also leaves when he does,
              which is what it needed a width gate of its own for before. */}
          {hasLookup && <FoundAnimalButton />}
        </div>
        <HomeCat locale={locale} />
      </div>

      {/* Before the grid, so the notice's place is held from the first
          paint for a visitor with something new to see (lib/last-visit.ts). */}
      <NewListingsScript newest={newestListing(gridAnimals)} />
      <AnimalGrid
        // Everything above this line is counted on the server and stays
        // here; the grid is a client component, so what it is given is
        // what ends up in the page's flight payload.
        animals={gridAnimals}
        logos={getShelterLogos()}
        referenceDate={dataset?.generatedAt ?? new Date().toISOString()}
        municipalitiesUrl={clientPayload("municipalities", municipalities).url}
        offSiteShelters={offSiteShelters}
      />
    </SiteShell>
  );
}
