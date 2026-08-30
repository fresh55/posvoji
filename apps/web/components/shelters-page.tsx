import { Building2, MapPinned, PawPrint, ShieldCheck } from "lucide-react";
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
  sharesDataLabel,
  shelterCount,
  waitingLabel,
} from "@/lib/labels";
import { shelterCensus } from "@/lib/shelter-census";
import { shelterListJsonLd } from "@/lib/shelter-jsonld";
import { getShelterLogos } from "@/lib/shelter-logos";
import { homePath, sheltersIndexPath, shelterPath } from "@/lib/shelter-path";
import { loadShelters, shelterRegisterDate } from "@/lib/shelters";
import { siteLinks } from "@/lib/site-links";

/** This page's address in both locales. The language switcher needs the pair,
 *  and the header reads the current locale's half out of it to mark the nav
 *  item that points here, so the route is written once. */
const SHELTER_INDEX_PATHS = {
  sl: sheltersIndexPath("sl"),
  en: sheltersIndexPath("en"),
} as const;

/** The issue form a shelter that is not in the registry yet can actually
 *  reach. The project has no contact address of its own, and the portal login
 *  only answers to an address already on file, so this is the only real way
 *  in. Named here rather than inside the copy, so the two locales point at one
 *  destination. */
const JOIN_URL =
  "https://github.com/fresh55/posvoji/issues/new?template=predlagaj-zavetisce.yml";

const pageText = {
  sl: {
    title: "Zavetišča po Sloveniji",
    lookupLink: "Iskalnik po občinah",
    lookupRest: "Pove, katero zavetišče je pristojno za tvojo občino.",
    sortNote: "Razvrščeno po kraju.",
    website: "Spletna stran",
    email: "E-pošta",
    phone: "Telefon",
    newWindow: "(odpre se v novem oknu)",
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
    lookupLink: "Municipality lookup",
    lookupRest: "Answers which shelter is responsible for your town.",
    sortNote: "Sorted by town.",
    website: "Website",
    email: "Email",
    phone: "Phone",
    newWindow: "(opens in a new window)",
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

// What the page is, in one sentence, and no numbers in it.
//
// It used to open "Vseh 17 zavetišč iz javnega registra UVHVVR" and close
// "pri 11 od 17 zavetišč", with the census line under it saying 17 and 11
// again forty pixels later: three 17s and two 11s inside one block. Numbers
// belong to the census, which is built to be scanned and already refuses to
// print a zero; the sentence keeps the part a number cannot carry, which is
// that the list is the shelter's and we publish it only by permission.
//
// The registry is named once more on the page, in the provenance line at the
// foot, where it carries the date that makes it a citation rather than a
// claim. Naming it here as well put "register" on the page three times over,
// counting the kicker directly above this.
function lede(locale: Locale): string {
  return locale === "en"
    ? "Every animal shelter in Slovenia, with its contact details in one place. Where a shelter gives us permission, we publish its animals too."
    : "Vsa slovenska zavetišča za živali, s kontakti na enem mestu. Kjer nam zavetišče to dovoli, objavimo tudi njegove živali.";
}

export function SheltersPage({ locale }: { locale: Locale }) {
  const shelters = loadShelters();
  const dataset = loadDataset();
  const animals = dataset?.animals ?? [];
  const text = pageText[locale];
  const messages = getMessages(locale);
  const homeHref = homePath(locale);

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
      <div className="mx-auto flex min-h-full w-full max-w-7xl flex-col px-gutter">
        <SiteHeader homeHref={homeHref} languagePaths={SHELTER_INDEX_PATHS} />

        {/* Full width, the same as the home page's main (site-page.tsx). The
            header and the footer bleed to the 7xl frame, so a 5xl main put the
            logo 96px left of the h1 above 1088px and ran both rules 192px wider
            than the grid they bracket. The prose blocks keep their own cap, so
            the measure does not follow the frame out. */}
        <main className="flex w-full flex-1 flex-col gap-section-gap py-page-y">
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
                {lede(locale)}
              </p>
              {/* data/municipalities.yaml answers "which shelter covers my
                  town" for all 212 občin, and this page never said so. Under
                  the lede rather than beside the search, because it is a
                  different question: not where a shelter is, but which one has
                  to answer.

                  A button, in the outline size the shelter page already gives
                  its contacts, rather than the underlined link this was. For
                  somebody who has just found a stray it is the most useful
                  thing on the page and it read as prose: a muted sentence with
                  a link inside it, in a column of muted sentences. Outline and
                  small is as loud as the site's action vocabulary goes without
                  becoming a hero, which this page cannot afford: the register
                  is what the reader came for.

                  MapPinned, the glyph the shelter page's coverage heading
                  already uses. The lookup and that section answer the same
                  question from opposite ends, so they wear the same mark. A
                  magnifier would have promised a search of the list on this
                  page, which is not what it opens.

                  The sentence stays beside the button rather than inside it:
                  it explains what the lookup does, and a button label that is
                  a full sentence stops reading as a control.

                  Drawn at 44px below lg, which is where this repo puts the
                  touch/pointer boundary (site-menu.tsx switches to the
                  dropdown there). size="sm" is h-8, and at 32px this was the
                  smallest deliberate control on a page whose brand,
                  breadcrumb, hamburger and footer links all reach 44. Grown
                  rather than overlaid with tap-target, for the reason that
                  utility's own block in globals.css gives, and because this
                  one is meant to be the loudest thing under the lede for
                  somebody holding a stray: a 32px button that merely accepts
                  a 44px tap still reads as small. The padding goes with the
                  height, or a 44px box on 10px of side padding reads as a
                  stretched pill.

                  min-h-11 and not h-11, the same spelling animal-grid.tsx
                  uses on the same variant: a floor lets the label wrap and
                  the box follow, where a fixed height would clip it. Nothing
                  wraps at the sizes this is read at today, which is exactly
                  why the difference would go unnoticed.

                  From lg the classes stop applying and the button is size="sm"
                  again, unchanged: outline and small is the treatment argued
                  for above, and a pointer does not need the 44. */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 pt-1">
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="max-lg:min-h-11 max-lg:gap-1.5 max-lg:px-4"
                >
                  <a href={FOUND_ANIMAL_PATHS[locale]}>
                    <MapPinned aria-hidden />
                    {text.lookupLink}
                  </a>
                </Button>
                <p className="text-sm text-muted-foreground">
                  {text.lookupRest}
                </p>
              </div>

              {/* The census line: the register's totals as one typographic
                  band, no box and no fill, hairlines between the groups.
                  Static and server-rendered, because it states the registry
                  and the registry does not move under the reader.
                  never-print-a-zero, the same rule the lede keeps: a zero here
                  reads as a failure of the site rather than as a fact about
                  Slovenia, so a group with nothing in it does not render.

                  Built from a list rather than three hand-spaced spans. The
                  padding used to be written per group (pr-4, pl-4 pr-4, pl-4)
                  and had to be re-derived by hand whenever a group could be
                  absent; first:pl-0 last:pr-0 lets the row space itself
                  whichever groups survive the filter.

                  The hairlines and the padding start at sm, because neither
                  survives a wrap. divide-x rules the trailing edge of every
                  group but the last, which is a separator only while the
                  groups are on one line: at 375px the third wraps, and the
                  second is left drawing a stroke into the empty end of line
                  one while the third starts line two 16px in from the column
                  edge on its own pl-4. Below sm the row spaces itself with
                  gaps instead, which wrap cleanly. */}
              <p className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1 text-sm text-muted-foreground sm:gap-x-0 sm:divide-x sm:divide-border">
                {[
                  shelters.length > 0 && {
                    key: "shelters",
                    icon: Building2,
                    count: shelters.length,
                    body: (
                      <span className="tabular-nums">
                        {shelterCount(shelters.length, locale)}
                      </span>
                    ),
                  },
                  census.withData > 0 && {
                    key: "providers",
                    icon: ShieldCheck,
                    count: census.withData,
                    body: (
                      <span>
                        {/* The count in the green the site marks a
                            data-sharing shelter with everywhere else, because
                            it is the same fact. */}
                        <span className="font-medium tabular-nums text-[var(--filter-accent-foreground)]">
                          {census.withData}
                        </span>{" "}
                        {sharesDataLabel(census.withData, locale)}
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
                        {waitingLabel(census.animals, locale)}
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
                    <span
                      key={key}
                      data-census={key}
                      data-count={count}
                      className="flex items-center gap-1.5 py-0.5 sm:px-4 sm:first:pl-0 sm:last:pr-0"
                    >
                      <Icon className="size-3.5 shrink-0" aria-hidden />
                      {body}
                    </span>
                  ))}
              </p>
            </div>
          </div>

          <SheltersAtlas
            shelters={cards}
            card={{
              website: text.website,
              email: text.email,
              phone: text.phone,
              newWindow: text.newWindow,
              animals: (count) => animalCount(count, locale),
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
                newWindow: text.newWindow,
              }
            }
          />

          {/* The invite card above already terminates the atlas block, so the
              provenance stays the quiet last word with no rule of its own. */}
          <p className="max-w-3xl text-xs text-muted-foreground">
            {asOf ? `${text.source}, ${text.asOf} ${asOf}.` : `${text.source}.`}
          </p>
        </main>

        {/* The register is 5,967px at 375px, which is 7.3 screens, and nothing
            on this page is fixed or sticky: the header is static, so from the
            last card the language switcher, the nav and the trail are all
            about 6,000px of hand scrolling away. The homepage grid has had
            this control since it was written (animal-filters.tsx) and this
            page never got it, although it is the second longest document on
            the site.

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
        <SiteFooter locale={locale} showSheltersLink={false} docked />
      </div>
    </I18nProvider>
  );
}
