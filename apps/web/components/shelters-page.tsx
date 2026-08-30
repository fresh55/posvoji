import { Building2, PawPrint, ShieldCheck } from "lucide-react";
import { PageBreadcrumb } from "@/components/page-breadcrumb";
import { I18nProvider } from "@/components/i18n-provider";
import { JsonLd } from "@/components/json-ld";
import type { ShelterCardData } from "@/components/shelter-card";
import { SheltersAtlas } from "@/components/shelters-atlas";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
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
import { shelterListJsonLd } from "@/lib/shelter-jsonld";
import { getShelterLogos } from "@/lib/shelter-logos";
import {
  homePath,
  sheltersIndexPath,
  shelterPath,
} from "@/lib/shelter-path";
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
    lookupRest: "pove, katero zavetišče je pristojno za tvojo občino.",
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
    lookupLink: "The municipality lookup",
    lookupRest: "answers which shelter is responsible for your town.",
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
  // to name that order. The cards print no region, and an order the page never
  // states is an order the reader cannot use: alphabetical towns are the one
  // sequence somebody can predict without being told. Eleven of the seventeen
  // names open with the word "Zavetišče", so sorting by name would order most
  // of the page by a word printed on most of the page.
  const collator = new Intl.Collator(locale === "sl" ? "sl" : "en");
  const cards: ShelterCardData[] = shelters
    .map((shelter) => ({
      id: shelter.id,
      name: shelter.name,
      city: shelter.city,
      href: shelterPath(shelter.id, locale),
      logo: logos[shelter.id],
      website: shelter.website,
      email: shelter.email,
      phone: shelter.phone,
    }))
    .sort(
      (a, b) =>
        collator.compare(a.city, b.city) || collator.compare(a.name, b.name),
    );

  // Counted off the dataset rather than off the cards: the count is the page's
  // own fact, printed once in the lede and once in the census line, and no
  // longer anything a card carries.
  const withData = new Set(
    animals.map((animal) => animal.shelter.id),
  ).size;

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
        <SiteHeader
          homeHref={homeHref}
          languagePaths={SHELTER_INDEX_PATHS}
        />

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
                  town" for all 212 občin, and this page never said so. One
                  line, under the lede rather than beside the search, because
                  it is a different question: not where a shelter is, but which
                  one has to answer. */}
              <p className="text-sm text-muted-foreground">
                <a
                  href={FOUND_ANIMAL_PATHS[locale]}
                  className="underline underline-offset-4 hover:text-foreground"
                >
                  {text.lookupLink}
                </a>{" "}
                {text.lookupRest}
              </p>

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
                    body: (
                      <span className="tabular-nums">
                        {shelterCount(shelters.length, locale)}
                      </span>
                    ),
                  },
                  withData > 0 && {
                    key: "providers",
                    icon: ShieldCheck,
                    body: (
                      <span>
                        {/* The count in the green the site marks a
                            data-sharing shelter with everywhere else, because
                            it is the same fact. */}
                        <span className="font-medium tabular-nums text-[var(--filter-accent-foreground)]">
                          {withData}
                        </span>{" "}
                        {sharesDataLabel(withData, locale)}
                      </span>
                    ),
                  },
                  animals.length > 0 && {
                    key: "animals",
                    icon: PawPrint,
                    body: (
                      <span>
                        <span className="tabular-nums">
                          {animalCount(animals.length, locale)}
                        </span>{" "}
                        {waitingLabel(animals.length, locale)}
                      </span>
                    ),
                  },
                ]
                  .filter((group) => group !== false)
                  .map(({ key, icon: Icon, body }) => (
                    <span
                      key={key}
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
            }}
            text={{
              heading: text.heading,
              skip: text.skip,
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

        <SiteFooter locale={locale} showSheltersLink={false} />
      </div>
    </I18nProvider>
  );
}
