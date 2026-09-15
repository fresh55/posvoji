import { AnimalGrid } from "@/components/animal-grid";
import { FoundAnimalButton } from "@/components/found-animal-button";
import { FoundAnimalRedirect } from "@/components/found-animal-redirect";
import { CAT_CORNER, HomeCat } from "@/components/home-cat";
import { SiteFooter } from "@/components/site-footer";
import { SiteShell } from "@/components/site-shell";
import { animalsForClient, loadDataset } from "@/lib/dataset";
import { getMessages, type Locale } from "@/lib/i18n";
import { shelterCount } from "@/lib/labels";
import { verificationTime } from "@/lib/source-freshness";
import { buildMunicipalityEntries } from "@/lib/municipality-coverage";
import { getShelterLogos } from "@/lib/shelter-logos";
import { getShelterPhones, loadShelters } from "@/lib/shelters";

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
    .sort((a, b) => a.label.localeCompare(b.label, "sl"));
  const messages = getMessages(locale);
  // Read once: the hero row and the footer both ask it, and they must not
  // drift into two different answers about whether the lookup exists.
  const hasLookup = municipalities.length > 0;

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
      // read the same timestamp through the same formatter.
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
          a number of its own (CAT_CORNER): the corner shrinks with the stage
          on a phone held sideways, where the full one cost the heading a
          second line on a 390px-tall screen. */}
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
            dock under it and no drawing beside the title. */}
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
            <p>
              {shelterCount(shelters, locale)} · {messages.listPublished}{" "}

              {verificationTime(dataset.generatedAt, locale)}
            </p>
          )}
          {/* One link in this row, and it is the one addressed to somebody
              with a problem. The cat's link is his caption now; home-cat.tsx
              says what it was doing here and why it left. */}
          {hasLookup && <FoundAnimalButton />}
        </div>
        <HomeCat locale={locale} />
      </div>

      <AnimalGrid
        // Everything above this line is counted on the server and stays
        // here; the grid is a client component, so what it is given is
        // what ends up in the page's flight payload.
        animals={animalsForClient(animals)}
        logos={getShelterLogos()}
        phones={getShelterPhones()}
        referenceDate={dataset?.generatedAt ?? new Date().toISOString()}
        municipalities={municipalities}
        offSiteShelters={offSiteShelters}
      />
    </SiteShell>
  );
}
