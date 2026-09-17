import {
  Bot,
  Building2,
  DoorOpen,
  EyeOff,
  FileCheck,
  Link2,
  ListChecks,
  type LucideIcon,
  UserX,
} from "lucide-react";
import { PageBreadcrumb } from "@/components/page-breadcrumb";
import { SiteFooter } from "@/components/site-footer";
import { SiteShell } from "@/components/site-shell";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { mailtoHref } from "@/lib/contact-links";
import { getMessages, type Locale } from "@/lib/i18n";
import {
  MUTED_SENTENCE_LINK,
  PAGE_TITLE,
  QUIET_DOC_LINK,
} from "@/lib/link-styles";
import { CONTACT_EMAIL, REPO_URL } from "@/lib/site";
import { ABOUT_PATHS, DATA_POLICY_PATHS } from "@/lib/site-links";

/**
 * Where the technical version of these rules lives, for whoever writes a
 * provider rather than runs a shelter. The page below is the shelter's half of
 * that document: the same commitments, without the schema, the CI check or the
 * file names, because a shelter reading what happens to its photos should not
 * have to read a repository to find out.
 *
 * The two are kept in step by hand. Changing a principle in one means changing
 * it in the other, and docs/DATA-POLICY.md says so at the top.
 */
const FULL_POLICY_URL = `${REPO_URL}/blob/main/docs/DATA-POLICY.md`;

/** The same source in both locales, the rule model-credit.tsx states: a file
 *  name is not translated, so it does not sit in the locale records. */
const FULL_POLICY_LABEL = "DATA-POLICY.md";

/** A pure function of a module constant, resolved once rather than per render,
 *  the habit site-footer.tsx keeps for the same address. */
const CONTACT_HREF = mailtoHref(CONTACT_EMAIL);

// One glyph per commitment, keyed rather than stored in each locale, the rule
// about-page.tsx records: the two locale records carry text only and cannot
// pick different marks for one fact. Building2 is the mark that page gives the
// shelter, which is who a direct listing belongs to.
const ruleIcons = {
  permission: FileCheck,
  factsFirst: ListChecks,
  source: Link2,
  noPersonalData: UserX,
  visitor: EyeOff,
  politeCrawl: Bot,
  directListing: Building2,
  exit: DoorOpen,
} satisfies Record<string, LucideIcon>;

type RuleKey = keyof typeof ruleIcons;

type Rule = {
  key: RuleKey;
  title: string;
  body: string;
  /** The sentence after the body that ends in the contact address, on the one
   *  rule a shelter acts on rather than reads. */
  contact?: string;
};

type PageText = {
  title: string;
  lead: string;
  rules: Rule[];
  grantTitle: string;
  /** What a shelter's permission decides, one entry per line. */
  grants: string[];
  copyright: string;
  /** The line under everything, and the only thing on this page that leaves
   *  the site. The file name it ends in is FULL_POLICY_LABEL, not a field. */
  technical: string;
};

// Written from docs/DATA-POLICY.md and kept in step with it by hand. Do not
// promise here what policy.yaml does not enforce there.
const pageText: Record<Locale, PageText> = {
  sl: {
    title: "Vsebine in dovoljenja",
    lead: "Kaj objavimo, s čigavim dovoljenjem in kako zavetišče to kadarkoli spremeni.",
    rules: [
      {
        key: "permission",
        title: "Dovoljenje pred objavo",
        body: "Živali zavetišča začnemo objavljati šele, ko zavetišče to pisno dovoli. Dovoljenje zapišemo z datumom. Brez zapisanega dovoljenja se objava ne vklopi.",
      },
      {
        key: "factsFirst",
        title: "Privzeto samo dejstva",
        // The three fields a policy actually narrows are images, descriptions
        // and attribution (apps/ingest/src/publication-policy.ts). Everything
        // else in the schema is an objective fact and publishes regardless, so
        // this names the facts as a kind and says what the permission decides,
        // rather than printing a closed list the pipeline does not keep.
        body: "Brez posebnega dovoljenja objavimo dejstva o živali: ime, vrsto, spol, starost, velikost, zdravstvene podatke, s kom se razume, status, zavetišče in povezavo na izvorno objavo. Dovoljenje zavetišča odloča o treh stvareh: o fotografijah, o opisih in o načinu navedbe vira.",
      },
      {
        key: "source",
        title: "Vir je vedno naveden",
        body: "Pri vsaki živali je navedeno zavetišče, čas zadnjega preverjanja in povezava na izvorno objavo. Posvojitev vedno poteka pri zavetišču.",
      },
      {
        key: "noPersonalData",
        title: "Brez osebnih podatkov",
        body: "Ne zbiramo in ne objavljamo podatkov zasebnih lastnikov, posvojiteljev ali prosilcev. Oglasov zasebne oddaje ne zajemamo. Številk mikročipov ne shranjujemo.",
      },
      {
        key: "visitor",
        title: "Vaš obisk",
        // Every clause here was measured against the build before it was
        // written: no tracker name appears in out/, the only external URLs in
        // the HTML are links a reader chooses, the fonts are local, and
        // hooks/use-nearby-origin.ts keeps a location fix in a module
        // singleton on purpose. localStorage is named rather than denied,
        // because components/filters/use-filter-sections.ts does write to it.
        body: "Obiska ne merimo in z drugih strani ne nalagamo ničesar: brez sledilcev, brez oglasnih omrežij, pisave gostimo sami. Za ogled ne potrebujete računa. V vaš brskalnik shranimo eno samo stvar, to je, katere sklope filtrov ste odprli. Če dovolite dostop do lokacije, jo uporabimo za razvrstitev po bližini in je ne shranimo, ne pri vas ne pri nas.",
      },
      {
        key: "politeCrawl",
        title: "Vljudno zajemanje",
        // "Na posamezen strežnik" is the qualifier both docs keep and the page
        // had dropped: the lock in polite-client.ts is per host, and providers
        // run in parallel. "Odneha" is the accurate verb, not backoff: only 429
        // and 503 are retried, and any other server error throws at once.
        body: "Naš program se predstavi kot PosvojiBot s kontaktom, spoštuje robots.txt in na posamezen strežnik pošilja največ eno zahtevo naenkrat, z večsekundnim razmikom. Če strežnik javi napako, odneha in počaka do naslednjega zajema. Družbenih omrežij ne zajemamo.",
      },
      {
        key: "directListing",
        title: "Neposredna objava",
        // What this said before: that such a listing "velja kot dovoljenje".
        // The portal shows a shelter no such sentence anywhere, so the page was
        // asserting a grant the granting side had never been given to read.
        // It now describes what happens instead of claiming consent.
        //
        // The source was also wrong. listingSourceUrl in
        // apps/ingest/src/portal-listings.ts returns /zavetisca/<slug>, which is
        // the shelter's public page on this site and not anything on the portal.
        body: "Zavetišče brez lastnega seznama živali lahko svoje živali objavi neposredno pri nas. Objavimo to, kar zavetišče vnese, in kot vir navedemo njegovo javno stran na Posvoji.si, ker je izvorna objava tukaj. Umik objave je v rokah zavetišča; s strani izgine ob naslednji objavi seznama.",
      },
      {
        key: "exit",
        title: "Pravica do izhoda",
        body: "Zavetišče lahko kadarkoli zahteva spremembo prikaza, izključitev fotografij, redkejše osveževanje ali popolno izključitev. Zahteve za odstranitev obravnavamo prednostno.",
        contact: "Pišite nam na",
      },
    ],
    grantTitle: "Kaj določi zavetišče",
    grants: [
      "ali pomanjšane fotografije prikažemo in jih shranimo na svojem strežniku,",
      "ali smemo fotografijo uporabiti v sliki za predogled povezave; brez tega dovoljenja žival dobi kartico brez fotografije,",
      "ali smemo prikazati logotip zavetišča; logotip je znamka zavetišča in ne spada pod dovoljenje za fotografije živali, zato ima svoje dovoljenje in svoj datum,",
      "koliko opisa prikažemo: samo dejstva, kratek izvleček ali celoten opis,",
      "kako pogosto osvežujemo in katere poti izpustimo,",
      "kako navedemo vir.",
    ],
    copyright:
      "Avtorske pravice ostanejo v celoti zavetišču oziroma izvornim imetnikom. Vsebine zavetišč niso del odprtokodne licence te strani in niso odprti podatki.",
    technical: "Tehnični zapis teh pravil, za razvijalce:",
  },
  en: {
    title: "Content and permissions",
    lead: "What we publish, whose permission it rests on, and how a shelter changes it at any time.",
    rules: [
      {
        key: "permission",
        title: "Permission before publication",
        body: "We start publishing a shelter’s animals only once the shelter gives written permission. The permission is recorded with its date. Without a recorded permission, publication does not switch on.",
      },
      {
        key: "factsFirst",
        title: "Facts by default",
        body: "Without further permission we publish the facts about an animal: name, species, sex, age, size, health details, what it gets on with, status, shelter and a link to the original listing. The shelter’s permission decides three things: photos, descriptions and how we credit the source.",
      },
      {
        key: "source",
        title: "The source is always named",
        body: "Every animal names its shelter, when we last checked the listing and a link to the original. Adoption always goes through the shelter.",
      },
      {
        key: "noPersonalData",
        title: "No personal data",
        body: "We do not collect or publish data about private owners, adopters or applicants. Private rehoming ads are excluded. We do not store microchip numbers.",
      },
      {
        key: "visitor",
        title: "Your visit",
        body: "We do not measure visits and we load nothing from other sites: no trackers, no ad networks, and we host the fonts ourselves. No account is needed to browse. We keep one thing in your browser, which is which filter sections you opened. If you allow access to your location, we use it to sort by distance and store it nowhere, neither on your device nor with us.",
      },
      {
        key: "politeCrawl",
        title: "Polite crawling",
        body: "Our crawler identifies itself as PosvojiBot with a contact address, respects robots.txt, and sends at most one request at a time to any one server, seconds apart. If a server returns an error it gives up and waits for the next run. We do not crawl social networks.",
      },
      {
        key: "directListing",
        title: "Listing directly",
        body: "A shelter with no catalogue of its own can list its animals directly with us. We publish what the shelter enters, and credit its own public page on Posvoji.si as the source, because the original listing is here. Withdrawing a listing is the shelter’s to do; it leaves the site when the list is next published.",
      },
      {
        key: "exit",
        title: "The right to leave",
        body: "A shelter can at any time ask for a change to how it is shown, for photos to be dropped, for less frequent refreshing or to be removed entirely. Removal requests are handled first.",
        contact: "Write to us at",
      },
    ],
    grantTitle: "What the shelter decides",
    grants: [
      "whether we show scaled-down photos and keep them on our own server,",
      "whether we may use a photo in the link preview image; without that permission an animal gets a card with no photo,",
      "whether we may show the shelter’s logo; a logo is the shelter’s trademark rather than one of its animal photographs, so it carries its own permission and its own date,",
      "how much of a description we show: facts only, a short extract or the full text,",
      "how often we refresh and which paths we leave out,",
      "how we credit the source.",
    ],
    copyright:
      "Copyright remains entirely with the shelter or the original rights holders. Shelter content is not covered by this site’s open-source licence and is not an open dataset.",
    technical: "The technical version of these rules, for developers:",
  },
};

/**
 * This page's name, for the two routes that put it in the head.
 *
 * Exported rather than spelled again there, which is what the sibling routes
 * already do: /o-nas reads getMessages(locale).about and Srečko's route reads
 * SRECKO.name. A route that retypes the string is the drift its own comment
 * says it is preventing.
 */
export function dataPolicyTitle(locale: Locale): string {
  return pageText[locale].title;
}

/**
 * The long form of the one fact on /o-nas that a shelter has a reason to open.
 *
 * Its rows wear the about page's layout deliberately: this is that page's
 * "Vsebine z dovoljenjem" row written out, and a reader who follows the link
 * should land somewhere that looks like where they came from.
 */
export function DataPolicyPage({ locale }: { locale: Locale }) {
  const messages = getMessages(locale);
  const text = pageText[locale];

  return (
    <SiteShell
      locale={locale}
      languagePaths={DATA_POLICY_PATHS}
      mainClassName="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 py-page-y"
      // The address is printed inside the exit rule, where it is the thing to
      // do about the sentence above it. Same reason /o-nas passes the footer's
      // copy off: a second copy of one address on one screen says nothing new.
      footer={<SiteFooter locale={locale} showContact={false} />}
    >
      <div className="space-y-5">
        <PageBreadcrumb
          locale={locale}
          trail={[{ label: messages.about, href: ABOUT_PATHS[locale] }]}
          current={text.title}
        />
        <div className="space-y-3">
          <h1 className={PAGE_TITLE}>{text.title}</h1>
          <p className="text-lg leading-relaxed text-muted-foreground sm:text-xl">
            {text.lead}
          </p>
        </div>
      </div>

      {/* The about page's row layout, mt-px and all. That pixel is measured,
          and the measurement lives in about-page.tsx rather than here: two
          copies of one number is how the number drifts. */}
      <div className="divide-y border-y">
        {text.rules.map((rule) => {
          const Icon = ruleIcons[rule.key];
          return (
            <Item key={rule.key} layout="row" className="px-0 py-5">
              <ItemMedia className="mt-px">
                <Icon
                  className="size-5 shrink-0 text-muted-foreground"
                  aria-hidden
                />
              </ItemMedia>
              <ItemContent>
                <ItemTitle asChild className="text-base font-medium">
                  <h2>{rule.title}</h2>
                </ItemTitle>
                <ItemDescription className="text-sm leading-relaxed">
                  {rule.body}
                </ItemDescription>
                {rule.contact && (
                  // The address printed as itself rather than behind a word,
                  // the rule about-page.tsx records: a shelter writing from its
                  // own mail client has to be able to read it off the page.
                  //
                  // MUTED_SENTENCE_LINK and not SOURCE_LINK, measured: that one
                  // carries no colour and no standing underline, so inside this
                  // muted sentence it computed to the same ink as the words
                  // around it and weight was the whole signal. This is the one
                  // link on the page somebody presses rather than reads, and on
                  // a phone there is no hover to find it with.
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {rule.contact}{" "}
                    <a href={CONTACT_HREF} className={MUTED_SENTENCE_LINK}>
                      {CONTACT_EMAIL}
                    </a>
                    .
                  </p>
                )}
              </ItemContent>
            </Item>
          );
        })}
      </div>

      <div className="space-y-3">
        <h2 className="text-base font-medium">{text.grantTitle}</h2>
        {/* A list and not seven more rows: these are the clauses of one
            permission, and giving each a glyph would say they are seven
            separate commitments like the ones above. */}
        <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted-foreground">
          {text.grants.map((grant) => (
            <li key={grant}>{grant}</li>
          ))}
        </ul>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {text.copyright}
        </p>
      </div>

      {/* The page's one way out of the site, and the last line on it, because
          the reader it is for is not the reader the page is for. */}
      <p className="text-sm leading-relaxed text-muted-foreground">
        {text.technical}{" "}
        <a
          href={FULL_POLICY_URL}
          target="_blank"
          rel="noreferrer"
          className={QUIET_DOC_LINK}
        >
          {FULL_POLICY_LABEL}
          <span className="sr-only"> {messages.newWindow}</span>
        </a>
      </p>
    </SiteShell>
  );
}
