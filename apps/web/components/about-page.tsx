import {
  Building2,
  HeartHandshake,
  type LucideIcon,
  Mail,
  ShieldCheck,
} from "lucide-react";
import { AboutCat } from "@/components/about-cat";
import { ModelCredit } from "@/components/model-credit";
import { PageBreadcrumb } from "@/components/page-breadcrumb";
import { SiteFooter } from "@/components/site-footer";
import { SiteShell } from "@/components/site-shell";
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
import { MUTED_LINK } from "@/lib/link-styles";
import { CONTACT_EMAIL, REPO_URL } from "@/lib/site";
import { ABOUT_PATHS } from "@/lib/site-links";

type PageText = {
  lead: string;
  maintainer: string;
  points: { key: PointKey; title: string; body: string; link?: { label: string; href: string } }[];
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
  shelterData: ShieldCheck,
  shelterDecides: Building2,
} satisfies Record<string, LucideIcon>;

type PointKey = keyof typeof pointIcons;

// Practical guidance for adopters and shelters, grounded in DATA-POLICY.md.
// Do not promise live availability or a refresh interval: sources can lag.
// Browsing needs no account; shelters have a separate portal login.
const pageText: Record<Locale, PageText> = {
  sl: {
    lead: "Želimo, da bi živali iz zavetišč lažje našle dom. Zato na enem mestu zbiramo objave sodelujočih slovenskih zavetišč.",
    maintainer: "Posvoji.si razvijam in vzdržujem kot osebni projekt.",
    points: [
      {
        key: "shelterDecides",
        title: "Želite posvojiti?",
        body: "Za spoznavanje in pogoje posvojitve se obrnite na zavetišče ob objavi. Pred obiskom preverite, ali žival še išče dom. Posvojitev vodi zavetišče; naš seznam ne zajema vseh živali.",
      },
      {
        key: "free",
        title: "Brezplačna uporaba",
        body: "Za obiskovalce in zavetišča. Za ogled ne potrebujete računa. Brez oglasov in plačanih prednostnih uvrstitev.",
      },
      {
        key: "shelterData",
        title: "Vsebine z dovoljenjem",
        body: "Podatke, fotografije in opise objavljamo z dovoljenjem zavetišč in navedemo njihov vir.",
        link: { label: "O vsebinah in dovoljenjih", href: `${REPO_URL}/blob/main/docs/DATA-POLICY.md` },
      },
    ],
    report:
      "Ste zavetišče ali imate predlog? Pišite nam. Za popravek ali umik dodajte povezavo do objave.",
    code: "Koda na GitHubu",
  },
  en: {
    lead: "We want to help shelter animals find a home. Posvoji.si brings listings from participating Slovenian shelters together in one place.",
    maintainer: "I develop and maintain Posvoji.si as a personal project.",
    points: [
      {
        key: "shelterDecides",
        title: "Want to adopt?",
        body: "Contact the shelter on the listing to arrange a meeting and ask about adoption requirements. Check availability before visiting. The shelter handles the adoption; our list does not include every animal.",
      },
      {
        key: "free",
        title: "Free to use",
        body: "For visitors and shelters. No account needed to browse. No ads or paid priority listings.",
      },
      {
        key: "shelterData",
        title: "Content with permission",
        body: "We publish data, photos and descriptions with the shelters’ permission and credit their source.",
        link: { label: "Content and permissions", href: `${REPO_URL}/blob/main/docs/DATA-POLICY.md#english-summary` },
      },
    ],
    report:
      "Run a shelter or have a suggestion? Email us. For corrections or removal, include the listing link.",
    code: "Code on GitHub",
  },
};

// The footer draws the same mark at 14px inside a text link, this page at
// 16px inside a button. The geometry is shared, the drawing is not.
function GithubMark() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden data-icon="inline-start" className="size-4 fill-current">
      <path d={GITHUB_MARK} />
    </svg>
  );
}

// Small buttons grown to 44px below lg, the same spelling the shelters page
// gives its lookup button and for the reason argued there: a thumb needs the
// height, and the padding goes with it or the box reads as a stretched pill.
const THUMB_BUTTON = "max-lg:min-h-11 max-lg:gap-1.5 max-lg:px-4";

/**
 * The site's introduction remains readable while the cat loads independently.
 */
export function AboutPage({ locale }: { locale: Locale }) {
  const messages = getMessages(locale);
  const text = pageText[locale];

  return (
    <SiteShell
      locale={locale}
      languagePaths={ABOUT_PATHS}
      mainClassName="grid w-full flex-1 content-start gap-8 py-page-y sm:gap-10 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:gap-x-12"
      // The one footer that does not link to this page, because it is on it.
      // It passes the correction route off for the same reason: the contact
      // block above prints the address already, and a second copy of it two
      // hundred pixels lower says nothing new.
      footer={
        <SiteFooter locale={locale} showAboutLink={false} showContact={false}>
          <ModelCredit locale={locale} />
        </SiteFooter>
      }
    >
      <div className="space-y-5">
        <PageBreadcrumb locale={locale} current={messages.about} />
        <div className="space-y-3">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            {messages.about}
          </h1>
          {/* The page's one sentence, and a step above the facts rather
              than level with them. At 18px it sat two pixels off the
              bodies below it and the whole column read as one size. */}
          <p className="text-lg leading-relaxed text-muted-foreground sm:text-xl">
            {text.lead}
          </p>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {text.maintainer}
          </p>
        </div>
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
                {/* Match the title/body hierarchy used by resource cards. */}
                <ItemDescription className="text-sm leading-relaxed">
                  {point.body}
                </ItemDescription>
                {point.link && (
                  <a href={point.link.href} className={`${MUTED_LINK} w-fit rounded-sm underline focus-visible:outline-2 focus-visible:outline-offset-4`}>
                    {point.link.label}
                  </a>
                )}
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
              <Mail aria-hidden data-icon="inline-start" />
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

      {/* Keep the practical information first in mobile and keyboard
          reading order. On desktop the cat sits beside all three text
          rows, with the dedication directly beneath the model. */}
      <div className="lg:col-start-2 lg:row-span-3 lg:row-start-1 lg:flex lg:items-center">
        <AboutCat locale={locale} />
      </div>
    </SiteShell>
  );
}
