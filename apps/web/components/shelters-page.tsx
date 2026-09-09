import { Building2, ListChecks, MapPinned, PawPrint } from "lucide-react";
import { BackToTop } from "@/components/back-to-top";
import { PageBreadcrumb } from "@/components/page-breadcrumb";
import { I18nProvider } from "@/components/i18n-provider";
import { JsonLd } from "@/components/json-ld";
import type { ShelterCardData } from "@/components/shelter-card";
import { SheltersAtlas } from "@/components/shelters-atlas";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { loadDataset } from "@/lib/dataset";
import { FOUND_ANIMAL_PATHS } from "@/lib/found-animal";
import { getMessages, type Locale } from "@/lib/i18n";
import {
  animalCount,
  registerDateLabel,
  shelterCount,
} from "@/lib/labels";
import { shelterCensus } from "@/lib/shelter-census";
import { REPO_URL } from "@/lib/site";
import { shelterListJsonLd } from "@/lib/shelter-jsonld";
import { getShelterLogos } from "@/lib/shelter-logos";
import { SHELTER_INDEX_PATHS, shelterPath } from "@/lib/shelter-path";
import { loadShelters, shelterRegisterDate } from "@/lib/shelters";
import { siteLinks } from "@/lib/site-links";
import { CONTENT_ID } from "@/lib/skip-link";

/** The issue form a shelter that is not in the registry yet can actually
 *  reach. The project has no contact address of its own, and the portal login
 *  only answers to an address already on file, so this is the only real way
 *  in. Named here rather than inside the copy, so the two locales point at one
 *  destination. */
const JOIN_URL = `${REPO_URL}/issues/new?template=predlagaj-zavetisce.yml`;

const pageText = {
  sl: {
    title: "Zavetišča po Sloveniji",
    lead: "Kontakti slovenskih zavetišč na enem mestu.",
    permissionNote: "Objave živali dodamo z dovoljenjem zavetišč.",
    lookupLink: "Najdena žival? Poišči pomoč po občini",
    censusLabel: "Pregled zavetišč",
    inRegistry: "v registru",
    withListings: "z objavami",
    onSite: "na Posvoji.si",
    sortNote: "Razvrščeno po kraju.",
    website: "Spletna stran",
    email: "E-pošta",
    phone: "Telefon",
    noAnimals: "Brez objav na Posvoji.si",
    heading: "Zavetišča",
    skip: "Preskoči seznam zavetišč",
    inviteTitle: "Ste zavetišče?",
    inviteBody:
      "Vaše živali objavimo z vašim dovoljenjem in povezavo na vašo objavo.",
    inviteNote:
      "Prijava deluje le za e-naslove, ki so pri nas že vpisani. Če vas še nimamo,",
    inviteJoin: "nam to sporočite na GitHubu",
    source: "Vir: register zavetišč UVHVVR (gov.si)",
    asOf: "stanje na dan",
  },
  en: {
    title: "Shelters across Slovenia",
    lead: "Contact details for Slovenian animal shelters in one place.",
    permissionNote: "Animal listings are published with each shelter’s permission.",
    lookupLink: "Found an animal? Find help by municipality",
    censusLabel: "Shelter overview",
    inRegistry: "in the registry",
    withListings: "with listings",
    onSite: "on Posvoji.si",
    sortNote: "Sorted by town.",
    website: "Website",
    email: "Email",
    phone: "Phone",
    noAnimals: "No listings on Posvoji.si",
    heading: "Shelters",
    skip: "Skip the list of shelters",
    inviteTitle: "Are you a shelter?",
    inviteBody:
      "We publish your animals with your permission, linking back to your own listing.",
    inviteNote:
      "The login only works for an address already on our list. If we do not have you yet,",
    inviteJoin: "tell us on GitHub",
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
  const portal = siteLinks(locale, messages).find(
    (link) => link.key === "portal",
  );

  return (
    <I18nProvider locale={locale}>
      <div className="mx-auto flex min-h-dvh w-full max-w-7xl flex-col px-gutter">
        <SiteHeader locale={locale} languagePaths={SHELTER_INDEX_PATHS} />

        {/* Full width, the same as the home page's main (site-page.tsx). The
            header and the footer bleed to the 7xl frame, so a 5xl main put the
            logo 96px left of the h1 above 1088px and ran both rules 192px wider
            than the grid they bracket. The prose blocks keep their own cap, so
            the measure does not follow the frame out. */}
        <main
          id={CONTENT_ID}
          tabIndex={-1}
          className="flex w-full flex-1 flex-col gap-section-gap py-page-y"
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
            <div className="max-w-3xl space-y-3">
              <h1 className="text-3xl font-medium tracking-tight sm:text-4xl">
                {text.title}
              </h1>
              <p className="text-base leading-relaxed text-muted-foreground sm:text-lg">
                {text.lead}
              </p>
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

              {/* Label what is counted. Listing counts do not establish permission status or shelter capacity. */}
              <ul
                role="list"
                aria-label={text.censusLabel}
                data-shelter-census
                className="flex flex-wrap items-center gap-x-5 gap-y-1 pt-1 text-sm text-muted-foreground"
              >
                {[
                  shelters.length > 0 && {
                    key: "shelters",
                    icon: Building2,
                    count: shelters.length,
                    body: (
                      <span className="tabular-nums">
                        {shelterCount(shelters.length, locale)} {text.inRegistry}
                      </span>
                    ),
                  },
                  census.withData > 0 && {
                    key: "providers",
                    icon: ListChecks,
                    count: census.withData,
                    body: (
                      <span>
                        {shelterCount(census.withData, locale)} {text.withListings}
                      </span>
                    ),
                  },
                  census.animals > 0 && {
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
                ]
                  .filter((group) => group !== false)
                  .map(({ key, icon: Icon, count, body }) => (
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
                      className="flex items-center gap-1.5 py-0.5"
                    >
                      <Icon className="size-3.5 shrink-0" aria-hidden />
                      {body}
                    </li>
                  ))}
              </ul>
            </div>
          </div>

          <SheltersAtlas
            shelters={cards}
            card={{
              website: text.website,
              email: text.email,
              phone: text.phone,
              newWindow: messages.newWindow,
              animals: (count) => animalCount(count, locale),
              noAnimals: text.noAnimals,
            }}
            text={{
              heading: text.heading,
              skip: text.skip,
              sortNote: text.sortNote,
            }}
            invite={
              portal && {
                title: text.inviteTitle,
                body: text.inviteBody,
                note: text.inviteNote,
                joinLabel: text.inviteJoin,
                joinHref: JOIN_URL,
                newWindow: messages.newWindow,
              }
            }
          />

          {/* Keep publishing context beside the source so the introduction
              gets readers to the directory sooner, especially on phones. */}
          <div className="max-w-3xl space-y-2 text-sm leading-relaxed text-muted-foreground">
            <p>{text.permissionNote}</p>
            <p className="text-xs">
              {asOf ? `${text.source}, ${text.asOf} ${asOf}.` : `${text.source}.`}
            </p>
          </div>
        </main>

        {/* The register is 5,967px at 375px, which is 7.3 screens, and nothing
            on this page is fixed or sticky: the header is static, so from the
            last card the language switcher, the nav and the trail are all
            about 6,000px of hand scrolling away. The homepage grid has had
            this control since it was written (animal-filters.tsx) and this
            page never got it. It is not the longest document on the site: a
            shelter's own page draws its animals uncapped, and the largest of
            them runs some 28,000px, which is why that page mounts this too
            (shelter-detail-page.tsx).

            A client component under a server one. It reads scroll position
            and measures the footer, so it has to be, and mounting it from
            here only marks the boundary: everything above stays server
            rendered. It takes its label from I18nProvider, which this page
            already wraps the tree in. */}
        <BackToTop />

        {/* docked, on a page that has no dock.

            The prop's name is the homepage's, but what it does is padding
            derived from --back-to-top-bottom (see site-footer.tsx), and that
            is the strip the button parks in. Below lg the button does not
            lift over the footer the way it does from lg; it stays pinned to
            the viewport, so at the end of the document it lands on whatever
            the footer has put there, which here is the only route to any
            other page at phone width. This reserves that strip once. It is
            not double clearance: there is no dock on this page to have
            reserved it already. */}
        <SiteFooter
          locale={locale}
          showSheltersLink={false}
          updatedAt={dataset?.generatedAt}
          docked
        />
      </div>
    </I18nProvider>
  );
}
