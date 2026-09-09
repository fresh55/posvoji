import {
  Building2,
  Clock3,
  HeartHandshake,
  type LucideIcon,
  Mail,
  ShieldCheck,
  Users,
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
import { CONTACT_EMAIL, REPO_URL } from "@/lib/site";
import { ABOUT_PATHS } from "@/lib/site-links";

// Where a correction goes. Printed as the address itself rather than behind
// a word: a reader writing from their own mail client has to be able to read
// it off the page, and the one string is then both the link and its text.

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
  availability: Clock3,
  shelterData: ShieldCheck,
  shelterDecides: Building2,
  forShelters: Users,
} satisfies Record<string, LucideIcon>;

type PointKey = keyof typeof pointIcons;

// Practical guidance for adopters and shelters, grounded in DATA-POLICY.md.
// Do not promise live availability or a refresh interval: sources can lag.
// Browsing needs no account; shelters have a separate portal login.
const pageText: Record<Locale, PageText> = {
  sl: {
    lead: "Posvoji.si na enem mestu povezuje živali iz slovenskih zavetišč z ljudmi, ki jim želijo ponuditi dom. Nismo zavetišče in ne vodimo posvojitev.",
    points: [
      {
        key: "shelterDecides",
        title: "Želite posvojiti?",
        body: "Obrnite se na zavetišče, navedeno pri živali. Z njim se dogovorite za spoznavanje ter preverite potrebe živali, pogoje in morebitne stroške posvojitve. O posvojitvi odloča zavetišče.",
      },
      {
        key: "availability",
        title: "Ali žival še išče dom?",
        body: "Podatki se lahko spremenijo, preden se seznam osveži. Pred obiskom preverite pri zavetišču. Seznam ne zajema vseh živali v slovenskih zavetiščih.",
      },
      {
        key: "free",
        title: "Brezplačna uporaba",
        body: "Za obiskovalce in zavetišča. Za ogled ne potrebujete računa. Brez oglasov in plačanih prednostnih uvrstitev. Zasebnih oglasov in osebnih podatkov posameznikov ne objavljamo.",
      },
      {
        key: "shelterData",
        title: "Vsebine z dovoljenjem",
        body: "Podatke, fotografije in opise objavimo le v obsegu, ki ga dovoli zavetišče. Vir je naveden pri vsaki živali. Pravice do fotografij in opisov ostanejo njihovim imetnikom; odprta koda ne pomeni dovoljenja za uporabo teh vsebin.",
      },
      {
        key: "forShelters",
        title: "Za zavetišča",
        body: "Za vključitev nam pišite. Dogovorimo se za povezavo z vašim spletnim seznamom ali neposredno objavo prek portala. Kadarkoli lahko zahtevate popravek, umik vsebin ali prenehanje sodelovanja.",
      },
    ],
    report:
      "Za sodelovanje, popravek ali umik nam pišite. Pri napaki dodajte povezavo do objave in kaj je treba spremeniti.",
    code: "Koda na GitHubu",
  },
  en: {
    lead: "Posvoji.si brings together animals from Slovenian shelters and people who want to give them a home. We are not a shelter and do not handle adoptions.",
    points: [
      {
        key: "shelterDecides",
        title: "Want to adopt?",
        body: "Contact the shelter named on the animal’s listing. Arrange a meeting and ask about the animal’s needs, adoption requirements and any fees. The shelter makes the adoption decision.",
      },
      {
        key: "availability",
        title: "Still looking for a home?",
        body: "Details can change before the list is updated. Check with the shelter before visiting. This list does not include every animal in Slovenian shelters.",
      },
      {
        key: "free",
        title: "Free to use",
        body: "For visitors and shelters. No account is needed to browse. No ads or paid priority listings. We do not publish private-owner listings or individuals’ personal details.",
      },
      {
        key: "shelterData",
        title: "Content with permission",
        body: "We publish only the data, photos and descriptions the shelter permits. Every animal names its source. Photos and descriptions remain with their rights holders; open-source code does not grant permission to reuse that content.",
      },
      {
        key: "forShelters",
        title: "For shelters",
        body: "Email us to join. We can arrange to connect your website’s listings or help you publish directly through the portal. You can request corrections, content removal or an end to participation at any time.",
      },
    ],
    report:
      "Email us to take part, correct a listing or request removal. For a correction, include the listing link and what needs to change.",
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
 * The site's five facts remain readable while the cat loads independently.
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
