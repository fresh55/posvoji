import { ListChecks, MapPinned, PawPrint } from "lucide-react";
import { BackToTop } from "@/components/back-to-top";
import { PageBreadcrumb } from "@/components/page-breadcrumb";
import { JsonLd } from "@/components/json-ld";
import type { ShelterCardData } from "@/components/shelter-card";
import { SheltersAtlas } from "@/components/shelters-atlas";
import { SiteFooter } from "@/components/site-footer";
import { SiteShell } from "@/components/site-shell";
import { Button } from "@/components/ui/button";
import { loadDataset } from "@/lib/dataset";
import { shelterAnimalsPath } from "@/lib/filters";
import { FOUND_ANIMAL_PATHS } from "@/lib/found-animal";
import { getMessages, type Locale } from "@/lib/i18n";
import {
  animalCount,
  registerDateLabel,
  shelterCount,
} from "@/lib/labels";
import { shelterCensus } from "@/lib/shelter-census";
import { shelterListJsonLd } from "@/lib/shelter-jsonld";
import { getShelterLogos } from "@/lib/shelter-logos";
import { SHELTER_INDEX_PATHS, shelterPath } from "@/lib/shelter-path";
import { loadShelters, shelterRegisterDate } from "@/lib/shelters";
import { PAGE_TITLE, MUTED_LINK } from "@/lib/link-styles";
import { CONTACT_EMAIL } from "@/lib/site";
import { mailtoHref } from "@/lib/contact-links";

const pageText = {
  sl: {
    title: "Zavetišča po Sloveniji",
    // Follows the registry count as one sentence: "17 zavetišč iz registra,
    // kontakti na enem mestu." The count stays in the nominative the
    // formatter prints, so no case or verb has to agree with it.
    lead: "iz registra, kontakti na enem mestu.",
    permissionNote: "Objave živali dodamo z dovoljenjem zavetišč.",
    join: "Ste zavetišče in se želite vključiti? Pišite na",
    lookupLink: "Najdena žival? Poišči pomoč po občini",
    censusLabel: "Pregled zavetišč",
    withListings: "z objavami",
    onSite: "na Posvoji.si",
    sortNote: "Razvrščeno po kraju.",
    viewAnimals: "Poglej",
    noAnimals: "Brez objav na Posvoji.si",
    heading: "Zavetišča",
    skip: "Preskoči seznam zavetišč",
    source: "Vir: register zavetišč UVHVVR (gov.si)",
    asOf: "stanje na dan",
  },
  en: {
    title: "Shelters across Slovenia",
    lead: "from the registry, contact details in one place.",
    permissionNote: "Animal listings are published with each shelter’s permission.",
    join: "Would your shelter like to join? Email",
    lookupLink: "Found an animal? Find help by municipality",
    censusLabel: "Shelter overview",
    withListings: "with listings",
    onSite: "on Posvoji.si",
    sortNote: "Sorted by town.",
    viewAnimals: "View",
    noAnimals: "No listings on Posvoji.si",
    heading: "Shelters",
    skip: "Skip the list of shelters",
    source: "Source: UVHVVR shelter registry (gov.si)",
    asOf: "as of",
  },
} satisfies Record<Locale, Record<string, string>>;

export function SheltersPage({ locale }: { locale: Locale }) {
  const shelters = loadShelters();
  const dataset = loadDataset();
  const animals = dataset?.animals ?? [];
  const text = pageText[locale];
  const messages = getMessages(locale);

  const logos = getShelterLogos();

  // By town, and by name for the two towns that hold two.
  //
  // Not west to east, which the gazetteer used while it drew region headings
  // to name that order. The cards print no region, so the order has to be one
  // the reader can predict, and it has to be stated: the prominent line on a
  // card is the name, the town is the small line under it, and by name the
  // sequence looks arbitrary. text.sortNote says it above the grid. Eleven of
  // the seventeen names open with the word "Zavetišče", so sorting by name
  // would order most of the page by a word printed on most of the page.

  // How many animals the dataset holds for each shelter, counted once for both
  // readers of it: the card's marker, which prints one shelter's number, and
  // the census line, whose provider count is how many shelters are in here at
  // all. Counted off the dataset rather than off the cards, because it is the
  // dataset that decides whether a shelter shares a list, and joined to the
  // register there rather than here, so the two readers cannot come to
  // different totals. See lib/shelter-census.ts.
  const census = shelterCensus(shelters, animals);

  // An animal at a shelter the register does not list has no card to be
  // counted on, no detail page to link to and no permission recorded anywhere
  // the site can see. It is a provider enabled ahead of its registry entry,
  // which is a data fault rather than a page state, so the index refuses to
  // render instead of publishing a census that disagrees with its own grid.
  if (census.unregistered.length > 0) {
    throw new Error(
      "The dataset holds animals for shelters the register does not list: " +
        `${census.unregistered.join(", ")}\n` +
        "Add them to data/shelters.yaml or disable the provider. The register " +
        "is the source of truth for which shelters exist.",
    );
  }

  const collator = new Intl.Collator(locale === "sl" ? "sl" : "en");
  const cards: ShelterCardData[] = shelters
    .map((shelter) => ({
      id: shelter.id,
      name: shelter.name,
      city: shelter.city,
      href: shelterPath(shelter.id, locale),
      animalsHref: shelterAnimalsPath(shelter.id, locale),
      animals: census.byShelter.get(shelter.id),
      logo: logos[shelter.id],
      website: shelter.website,
      email: shelter.email,
      phone: shelter.phone,
    }))
    .sort(
      (a, b) =>
        collator.compare(a.city, b.city) || collator.compare(a.name, b.name),
    );

  const registerDate = shelterRegisterDate();
  const asOf = registerDate
    ? registerDateLabel(registerDate, locale)
    : undefined;

  return (
    <SiteShell
      locale={locale}
      languagePaths={SHELTER_INDEX_PATHS}
      // Full width, the same as the home page's main (site-page.tsx). The
      // header and the footer bleed to the 7xl frame, so a 5xl main put the
      // logo 96px left of the h1 above 1088px and ran both rules 192px wider
      // than the grid they bracket. The prose blocks keep their own cap, so
      // the measure does not follow the frame out.
      // The landscape phone this page used to override py-page-y for is
      // answered by the token itself now (globals.css), where the second page
      // that needed it was the signal to move it.
      mainClassName="flex w-full flex-1 flex-col gap-section-gap py-page-y"
      // The register is 5,967px at 375px, which is 7.3 screens, and nothing
      // on this page is fixed or sticky: the header is static, so from the
      // last card the language switcher, the nav and the trail are all about
      // 6,000px of hand scrolling away. The homepage grid has had this control
      // since it was written (animal-filters.tsx) and this page never got it.
      // It is not the longest document on the site: a shelter's own page draws
      // its animals uncapped, and the largest of them runs some 28,000px,
      // which is why that page mounts this too (shelter-detail-page.tsx).
      //
      // A client component under a server one. It reads scroll position and
      // measures the footer, so it has to be, and mounting it from here only
      // marks the boundary: everything above stays server rendered. It takes
      // its label from I18nProvider, which the shell already wraps the tree
      // in.
      afterMain={<BackToTop />}
      // docked, on a page that has no dock.
      //
      // The prop's name is the homepage's, but what it does is padding derived
      // from --back-to-top-bottom (see site-footer.tsx), and that is the strip
      // the button parks in. Below lg the button does not lift over the footer
      // the way it does from lg; it stays pinned to the viewport, so at the
      // end of the document it lands on whatever the footer has put there,
      // which here is the only route to any other page at phone width. This
      // reserves that strip once. It is not double clearance: there is no dock
      // on this page to have reserved it already.
      footer={
        <SiteFooter
          locale={locale}
          showSheltersLink={false}
          updatedAt={dataset?.generatedAt}
          docked
        />
      }
    >
      {/* The list in the order the page draws it, pointing at the detail
          pages that carry each shelter's own facts. */}
      <JsonLd data={shelterListJsonLd(cards, locale)} />

      <div className="space-y-5">
        {/* The trail takes the slot the back link had, and the kicker with
            it. "JAVNI REGISTER" was the only kicker on the site, so it was
            decoration rather than a system, and stacking it under a trail
            put two lines of small grey text above one h1. The register is
            still named where it counts: in the provenance line at the
            foot, with the date that makes it a citation. */}
        <PageBreadcrumb locale={locale} current={messages.shelters} />
        {/* short:space-y-2 for the same reason the main's padding tightens:
            four blocks with 12px between them is 36px of the landscape
            phone's 390, and 8px still separates them. Nothing else about the
            intro changes with the height. */}
        <div className="max-w-3xl space-y-3 short:space-y-2">
          <h1 className={PAGE_TITLE}>
            {text.title}
          </h1>
          <p className="text-base leading-relaxed text-muted-foreground sm:text-lg">
            <span data-census="shelters" data-count={shelters.length} className="tabular-nums">
              {shelterCount(shelters.length, locale)}
            </span>{" "}
            {text.lead}
          </p>
          {/* The two participation counts, under the lead they qualify.
              They were moved below the directory once, where 5,000px of
              cards stood between a reader and two numbers nobody scrolled
              to. Two items now, not three: the registry count is the lead's.
              Listing counts do not establish permission status or shelter
              capacity.

              Both rows are drawn whenever the block is. A shelter only enters
              byShelter because an animal was counted onto it, so withData > 0
              is animals > 0 (lib/shelter-census.ts): the guard the animals row
              used to carry was the gate above it said twice, and the array's
              `| false` member and the filter pass existed to express a branch
              that could not be taken. */}
          {census.withData > 0 && (
            <ul
              role="list"
              aria-label={text.censusLabel}
              data-shelter-census
              // gap-x-4 rather than gap-x-5. The groups carry no separator
              // below sm, so the gap is the only thing holding them apart,
              // and 16px seats the two on one line at 390 where 20px did
              // not. The e2e spec checks that every line starts at the same
              // x whatever the wrap does.
              className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground"
            >
              {[
                {
                  key: "providers",
                  icon: ListChecks,
                  count: census.withData,
                  body: (
                    <span>
                      {shelterCount(census.withData, locale)} {text.withListings}
                    </span>
                  ),
                },
                {
                  key: "animals",
                  icon: PawPrint,
                  count: census.animals,
                  body: (
                    <span>
                      <span className="tabular-nums">
                        {animalCount(census.animals, locale)}
                      </span>{" "}
                      {text.onSite}
                    </span>
                  ),
                },
              ].map(({ key, icon: Icon, count, body }) => (
                  // data-census and data-count are a test contract, not
                  // decoration, the same as data-contact on the cards'
                  // rows. What has to be checkable from the rendered page
                  // is that this line and the grid's green pills agree:
                  // one pill per shelter counted here, and the pills adding
                  // up to the total. Read off an attribute rather than the
                  // text, because Slovenian agrees the noun with the number
                  // and a test parsing "186 živali" would be parsing the
                  // dual as well.
                  <li
                    key={key}
                    data-census={key}
                    data-count={count}
                    // The 2px above and below is a pointer's hit area on a
                    // line that is not a control: nothing here is pressable,
                    // and on a phone it only adds 4px to each of the lines
                    // this wraps onto. So it starts at sm, where the line
                    // does not wrap and the padding costs nothing.
                    className="flex items-center gap-1.5 sm:py-0.5"
                  >
                    <Icon className="size-3.5 shrink-0" aria-hidden />
                    {body}
                  </li>
                ))}
            </ul>
          )}
          {/* This lookup serves people who have found a stray. */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 pt-1">
            <Button
              asChild
              variant="outline"
              size="sm"
              className="h-auto min-h-11 max-w-full gap-1.5 whitespace-normal px-4 py-2"
            >
              <a href={FOUND_ANIMAL_PATHS[locale]}>
                <MapPinned aria-hidden />
                {text.lookupLink}
              </a>
            </Button>
          </div>
        </div>
      </div>

      <SheltersAtlas
        shelters={cards}
        card={{
          website: messages.contactWebsite,
          email: messages.contactEmail,
          phone: messages.contactPhone,
          newWindow: messages.newWindow,
          animals: (count) => `${text.viewAnimals} ${animalCount(count, locale)}`,
          noAnimals: text.noAnimals,
        }}
        text={{
          heading: text.heading,
          skip: text.skip,
          sortNote: text.sortNote,
        }}
      />

      {/* For shelters: how listings get here and how to join. */}
      <div className="max-w-3xl space-y-2 text-sm leading-relaxed text-muted-foreground">
        <p>{text.permissionNote}</p>
        <p>
          {text.join}{" "}
          <a href={mailtoHref(CONTACT_EMAIL)} className={MUTED_LINK}>
            {CONTACT_EMAIL}
          </a>.
        </p>
        <p className="text-xs">
          {asOf ? `${text.source}, ${text.asOf} ${asOf}.` : `${text.source}.`}
        </p>
      </div>
    </SiteShell>
  );
}
