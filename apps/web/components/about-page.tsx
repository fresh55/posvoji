import {
  Building2,
  CodeXml,
  EyeOff,
  HeartHandshake,
  type LucideIcon,
  Mail,
  ShieldCheck,
} from "lucide-react";
import { AboutCat } from "@/components/about-cat";
import { I18nProvider } from "@/components/i18n-provider";
import { ModelCredit } from "@/components/model-credit";
import { PageBreadcrumb } from "@/components/page-breadcrumb";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { mailtoHref } from "@/lib/contact-links";
import { GITHUB_MARK } from "@/lib/github-mark";
import { getMessages, type Locale } from "@/lib/i18n";
import { homePath } from "@/lib/shelter-path";
import { REPO_URL } from "@/lib/site";
import { ABOUT_PATHS } from "@/lib/site-links";

// Where a correction goes. Printed as the address itself rather than behind
// a word: a reader writing from their own mail client has to be able to read
// it off the page, and the one string is then both the link and its text.
const CONTACT_EMAIL = "info@posvoji.si";

type PageText = {
  lead: string;
  points: { key: PointKey; title: string; body: string }[];
  /** The closing line. The address and the repository follow it as buttons
   *  and are not translated. */
  report: string;
  code: string;
};

// One glyph per fact, keyed rather than stored in each locale so the two
// records carry text only and cannot pick different marks for one fact.
// ShieldCheck is what the shelters page marks a data-sharing shelter with,
// which is the same fact.
//
// The keys are the source of the union below rather than a copy of it: a
// fact renamed here is a type error at both locale records, where a
// hand-written union only caught the direction that loses an icon.
const pointIcons = {
  free: HeartHandshake,
  openSource: CodeXml,
  shelterData: ShieldCheck,
  shelterDecides: Building2,
  noPersonalData: EyeOff,
} satisfies Record<string, LucideIcon>;

type PointKey = keyof typeof pointIcons;

// The same facts README.sl.md and the footer already state, said once in
// full. Nothing here that the code cannot back: no ads and no tracking
// because there are no remote tracking scripts, no accounts because
// the site has none for visitors, no payment for a place because there is
// no mechanism for one.
const pageText: Record<Locale, PageText> = {
  sl: {
    lead: "Posvoji.si je odprt in brezplačen seznam živali iz slovenskih zavetišč, ki iščejo dom.",
    points: [
      {
        key: "free",
        title: "Brezplačno",
        body: "Za obiskovalce in za zavetišča. Brez oglasov, brez računov in brez sledenja. Nihče ne plača za uvrstitev ali za boljše mesto na seznamu.",
      },
      {
        key: "openSource",
        title: "Odprta koda",
        body: "Vsa koda je javna na GitHubu. Vsak lahko preveri, kako stran deluje in kaj določa vrstni red živali.",
      },
      {
        key: "shelterData",
        title: "Podatki zavetišč",
        body: "Prikažemo samo, kar zavetišče dovoli. Pri vsaki živali sta navedena vir in povezava na izvorno objavo.",
      },
      {
        key: "shelterDecides",
        title: "Posvojitev pri zavetišču",
        body: "Posvoji.si ni zavetišče in ne vodi posvojitev. O vsaki živali odloča zavetišče, ki zanjo skrbi.",
      },
      {
        key: "noPersonalData",
        title: "Brez osebnih podatkov",
        body: "Zasebni oglasi, kontakti posameznikov in številke mikročipov ne sodijo na to stran.",
      },
    ],
    report:
      "Napačen podatek, zastarela objava ali žival, ki je že našla dom? Pišite nam.",
    code: "Koda na GitHubu",
  },
  en: {
    lead: "Posvoji.si is an open, free index of animals waiting for a home in Slovenian shelters.",
    points: [
      {
        key: "free",
        title: "Free",
        body: "For visitors and for shelters. No ads, no accounts and no tracking. Nobody pays to be listed or to rank higher.",
      },
      {
        key: "openSource",
        title: "Open source",
        body: "All the code is public on GitHub. Anyone can check how the site works and what decides the order of the animals.",
      },
      {
        key: "shelterData",
        title: "Data from shelters",
        body: "We show only what a shelter allows. Every animal names its source and links to the original listing.",
      },
      {
        key: "shelterDecides",
        title: "Adoption at the shelter",
        body: "Posvoji.si is not a shelter and does not handle adoptions. The shelter caring for an animal decides about it.",
      },
      {
        key: "noPersonalData",
        title: "No personal data",
        body: "Private listings, individuals’ contact details and microchip numbers do not belong here.",
      },
    ],
    report:
      "Wrong detail, stale listing or an animal that already found a home? Write to us.",
    code: "Code on GitHub",
  },
};

// The footer draws the same mark at 14px inside a text link, this page at
// 16px inside a button. The geometry is shared, the drawing is not.
function GithubMark() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className="size-4 fill-current">
      <path d={GITHUB_MARK} />
    </svg>
  );
}

// Small buttons grown to 44px below lg, the same spelling the shelters page
// gives its lookup button and for the reason argued there: a thumb needs the
// height, and the padding goes with it or the box reads as a stretched pill.
const THUMB_BUTTON = "max-lg:min-h-11 max-lg:gap-1.5 max-lg:px-4";

/**
 * The site's five facts remain readable while the cat loads independently.
 */
export function AboutPage({ locale }: { locale: Locale }) {
  const messages = getMessages(locale);
  const text = pageText[locale];
  const homeHref = homePath(locale);

  return (
    <I18nProvider locale={locale}>
      <div className="mx-auto flex min-h-dvh w-full max-w-7xl flex-col px-gutter">
        <SiteHeader homeHref={homeHref} languagePaths={ABOUT_PATHS} />

        <main className="grid w-full flex-1 content-start gap-8 py-page-y sm:gap-10 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:gap-x-12">
          <div className="space-y-5">
            <PageBreadcrumb locale={locale} current={messages.about} />
            <div className="space-y-3">
              <h1 className="text-3xl font-medium tracking-tight sm:text-4xl">
                {messages.about}
              </h1>
              {/* The page's one sentence, and a step above the facts rather
                  than level with them. At 18px it sat two pixels off the
                  bodies below it and the whole column read as one size. */}
              <p className="text-lg leading-relaxed text-muted-foreground sm:text-xl">
                {text.lead}
              </p>
            </div>
          </div>

          {/* The cat spans all three text rows and centres against them, so
              its mass sits opposite the facts rather than floating level with
              the heading and leaving a hole under itself. The cell is taller
              than the figure, so without this it anchors to the top: measured
              at 1280, the cat ended 240px above the last thing in the column.
              Below lg it is one block in the flow and centring says nothing. */}
          <div className="lg:col-start-2 lg:row-span-3 lg:row-start-1 lg:flex lg:items-center">
            <AboutCat locale={locale} />
          </div>

          {/* A rule between facts and nothing else. Each fact is an Item on
              the row layout: the glyph names it at a glance, and only the
              padding is this page's, so the rules run edge to edge.

              mt-px on the media, measured: the title is text-base under
              leading-snug, a 22px line box, and the glyph is 20px, so one
              pixel centres it on the first line. */}
          <div className="divide-y border-y lg:col-start-1 lg:row-start-2">
            {text.points.map((point) => {
              const Icon = pointIcons[point.key];
              return (
                <Item
                  key={point.key}
                  layout="row"
                  className="px-0 py-5"
                >
                  <ItemMedia className="mt-px">
                    <Icon
                      className="size-5 shrink-0 text-muted-foreground"
                      aria-hidden
                    />
                  </ItemMedia>
                  <ItemContent>
                    <ItemTitle asChild className="text-base font-medium">
                      <h2>{point.title}</h2>
                    </ItemTitle>
                    {/* A step under the title rather than the same size in a
                        lighter ink. Title and body were both 16px, so five
                        facts read as one block of text and the glyph was
                        doing all the work of telling them apart. The same
                        pairing the resources cards use. */}
                    <ItemDescription className="text-sm leading-relaxed">
                      {point.body}
                    </ItemDescription>
                  </ItemContent>
                </Item>
              );
            })}
          </div>

          {/* The sentence stays beside the buttons rather than inside them:
              it says what to write about, and a button label that is a full
              sentence stops reading as a control. */}
          <div className="space-y-3 lg:col-start-1 lg:row-start-3">
            <p className="text-sm leading-relaxed text-muted-foreground">
              {text.report}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                asChild
                variant="outline"
                size="sm"
                className={THUMB_BUTTON}
              >
                <a href={mailtoHref(CONTACT_EMAIL)}>
                  <Mail aria-hidden />
                  {CONTACT_EMAIL}
                </a>
              </Button>
              <Button
                asChild
                variant="outline"
                size="sm"
                className={THUMB_BUTTON}
              >
                <a href={REPO_URL} target="_blank" rel="noreferrer">
                  <GithubMark />
                  {text.code}
                </a>
              </Button>
            </div>
          </div>
        </main>

        {/* The one footer that does not link to this page, because it is on
            it. */}
        <SiteFooter locale={locale} showAboutLink={false}>
          <ModelCredit locale={locale} />
        </SiteFooter>
      </div>
    </I18nProvider>
  );
}
