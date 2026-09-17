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
import { getMessages, type Locale } from "@/lib/i18n";
import { COARSE_ACTION, PAGE_TITLE, QUIET_DOC_LINK } from "@/lib/link-styles";
import { CONTACT_EMAIL } from "@/lib/site";
import { ABOUT_PATHS, DATA_POLICY_PATHS } from "@/lib/site-links";

type PageText = {
  lead: string;
  maintainer: string;
  points: { key: PointKey; title: string; body: string; link?: { label: string; href: string } }[];
  /** The closing line. The address follows it as a button and is not
   *  translated. */
  report: string;
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
        link: { label: "O vsebinah in dovoljenjih", href: DATA_POLICY_PATHS.sl },
      },
    ],
    report:
      "Ste zavetišče ali imate predlog? Pišite nam. Za popravek ali umik dodajte povezavo do objave.",
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
        link: { label: "Content and permissions", href: DATA_POLICY_PATHS.en },
      },
    ],
    report:
      "Run a shelter or have a suggestion? Email us. For corrections or removal, include the listing link.",
  },
};

// Small buttons grown to 44px on a coarse pointer, the same spelling the
// shelters page gives its lookup button and for the reason argued there: a
// thumb needs the height, and the padding goes with it or the box reads as a
// stretched pill. On the pointer and not on the width, because a 1180px
// tablet is a thumb and a 1024px laptop window is not.
const THUMB_BUTTON = `${COARSE_ACTION} pointer-coarse:gap-1.5`;

/** w-fit because this one sits in a flex column; the rest is the shared rule. */
const POLICY_LINK = `${QUIET_DOC_LINK} w-fit`;

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
          <h1 className={PAGE_TITLE}>
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

          mt-px on the media. The number is right and the reason recorded
          for it was not: text-base carries its own 24px line-height and beats
          ItemTitle's leading-snug, so the line box is 24px against a 20px
          glyph and the true centre is 2px. Measured at -1.00px on every row
          on this page and on /o-nas/vsebine, and -1.50px at a 24px OS font.
          A pixel high reads better than a glyph on the baseline, so the value
          stays; the comment no longer claims a line box nothing draws. */}
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
                  // A page of this site now, and it used to be a markdown file
                  // on github.com. This is the one link on the page a shelter
                  // has a reason to open, and it landed them in a code
                  // repository. Nothing here says "new window" any more,
                  // because nothing here opens one.
                  <a
                    href={point.link.href}
                    className={POLICY_LINK}
                  >
                    {point.link.label}
                  </a>
                )}
              </ItemContent>
            </Item>
          );
        })}
      </div>

      {/* The sentence stays beside the button rather than inside it: it says
          what to write about, and a button label that is a full sentence stops
          reading as a control.

          One button, where there used to be a second one saying "Koda na
          GitHubu" at the same size and weight beside it. The sentence above is
          addressed to shelters, and a repository is not an answer to it: the
          reader it was for is a developer, and the footer of this very page
          already invites them, in the small print where that belongs. */}
      <div className="space-y-3 lg:col-start-1 lg:row-start-3">
        <p className="text-sm leading-relaxed text-muted-foreground">
          {text.report}
        </p>
        {/* One child now, so no wrap and no gap; the box stays because it is
            what keeps the button shrink-to-fit rather than inline. */}
        <div className="flex">
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
