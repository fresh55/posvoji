import {
  Building2,
  Clock3,
  HeartHandshake,
  type LucideIcon,
  Mail,
  PawPrint,
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
import {
  COARSE_ACTION,
  PAGE_LEAD,
  PAGE_TITLE,
  QUIET_DOC_LINK,
  SECTION_TITLE,
} from "@/lib/link-styles";
import { CONTACT_EMAIL } from "@/lib/site";
import { ABOUT_PATHS, DATA_POLICY_PATHS } from "@/lib/site-links";

type AboutPoint = {
  key: PointKey;
  title: string;
  body: string;
  link?: { label: string; href: string };
};

/** One audience: its heading, and the facts addressed to it. The rows under
 *  a heading are all one level, so a row in one section is never louder than
 *  the heading of the next. Which section a fact belongs to is stated here,
 *  beside the fact, rather than in a predicate naming keys somewhere else:
 *  a point added to the wrong list is visible where it is written. */
type AboutSectionText = { title: string; points: AboutPoint[] };

type PageText = {
  lead: string;
  adopters: AboutSectionText;
  shelters: AboutSectionText;
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
  shelterDecides: PawPrint,
  freshness: Clock3,
  shelterJoin: Building2,
} satisfies Record<string, LucideIcon>;

type PointKey = keyof typeof pointIcons;

// Practical guidance for adopters and shelters, grounded in DATA-POLICY.md.
// Do not promise live availability or a refresh interval: sources can lag.
// Browsing needs no account; shelters have a separate portal login.
//
// Two voices, and the two lists below are what keeps them apart: adopters are
// "ti" and shelters are "vi", so a point moved between them moves its address
// with it. The closing line stands outside both and takes the visitor's form.
// docs/COPY-VOICE.md has the rule.
const pageText: Record<Locale, PageText> = {
  sl: {
    lead: "Želimo, da bi živali iz zavetišč lažje našle dom. Zato na enem mestu zbiramo objave sodelujočih slovenskih zavetišč.",
    adopters: {
      title: "Za posvojitelje",
      points: [
        {
          key: "shelterDecides",
          title: "Kako poteka posvojitev?",
          body: "Ob vsaki objavi je navedeno zavetišče, ki za žival skrbi. Z njim se pogovori o njenih potrebah, svojem vsakdanu in spoznavanju. Zavetišče ti pojasni pogoje in morebitne stroške ter vodi posvojitev.",
          link: { label: "Poišči žival, ki išče dom", href: "/" },
        },
        {
          key: "freshness",
          title: "Ali žival še išče dom?",
          body: "Objave se lahko spremenijo, preden se sprememba pokaže pri nas. Pred obiskom pri zavetišču preveri, ali je žival še na voljo, in se dogovori za termin. Naš seznam ne zajema vseh živali in zavetišč.",
        },
        {
          key: "free",
          title: "Brezplačna uporaba",
          body: "Ogled živali in sodelovanje zavetišč sta brezplačna. Za ogled ne potrebuješ računa. Na strani ni oglasov ali plačanih prednostnih uvrstitev.",
        },
      ],
    },
    shelters: {
      title: "Za zavetišča",
      points: [
        {
          key: "shelterData",
          title: "Zavetišča odločate o svojih vsebinah",
          body: "Vaše objave vključimo z vašim dovoljenjem in obiskovalce usmerimo k vam. Sami določite, katere fotografije in opise smemo uporabiti; vir vedno navedemo. Kadarkoli lahko zahtevate popravek, umik vsebin ali prenehanje sodelovanja.",
          link: { label: "O vsebinah in dovoljenjih", href: DATA_POLICY_PATHS.sl },
        },
        {
          key: "shelterJoin",
          title: "Kako se zavetišče vključi?",
          body: "Pišite nam na spodnji naslov. Dogovorimo se o objavah z vaše spletne strani ali neposrednem vnosu pri nas, če svojega seznama živali nimate. Za ureditev dostopa do prijave nam prav tako pišite.",
          link: { label: "Že imate dostop? Prijava za zavetišča", href: "/portal/prijava" },
        },
      ],
    },
    report:
      "Si opazil napako ali je žival že našla dom? Pošlji nam povezavo do objave in povej, kaj je treba popraviti. Na isti naslov pišejo tudi zavetišča za sodelovanje, umik vsebin ali predlog.",
  },
  en: {
    lead: "We want to help shelter animals find a home. Posvoji.si brings listings from participating Slovenian shelters together in one place.",
    adopters: {
      title: "For adopters",
      points: [
        {
          key: "shelterDecides",
          title: "How does adoption work?",
          body: "Each listing names the shelter caring for the animal. Talk to them about the animal’s needs, your daily routine and arranging a meeting. The shelter explains the requirements and any costs, and handles the adoption.",
          link: { label: "Find an animal looking for a home", href: "/en" },
        },
        {
          key: "freshness",
          title: "Is the animal still available?",
          body: "Listings can change before the update appears here. Before visiting, check availability with the shelter and arrange a time to meet. Our list does not include every animal or shelter.",
        },
        {
          key: "free",
          title: "Free to use",
          body: "Browsing and shelter participation are free. You do not need an account to browse. There are no ads or paid priority listings.",
        },
      ],
    },
    shelters: {
      title: "For shelters",
      points: [
        {
          key: "shelterData",
          title: "Shelters stay in control of their content",
          body: "We include your listings with your permission and direct visitors to you. You decide which photos and descriptions we may use, and we always credit the source. You can request corrections, content removal or an end to your participation at any time.",
          link: { label: "Content and permissions", href: DATA_POLICY_PATHS.en },
        },
        {
          key: "shelterJoin",
          title: "How can a shelter join?",
          body: "Email us at the address below. We can arrange to use listings from your website, or help you list animals here if you do not have a catalogue of your own. Email us to arrange login access too.",
          link: { label: "Already have access? Shelter login", href: "/portal/prijava" },
        },
      ],
    },
    report:
      "Spotted a mistake, or has an animal already found a home? Send us the listing link and tell us what needs correcting. Use the same address to join, request content removal or share a suggestion.",
  },
};

// Small buttons grown to 44px on a coarse pointer, the same spelling the
// shelters page gives its lookup button and for the reason argued there: a
// thumb needs the height, and the padding goes with it or the box reads as a
// stretched pill. On the pointer and not on the width, because a 1180px
// tablet is a thumb and a 1024px laptop window is not.
const THUMB_BUTTON = `${COARSE_ACTION} pointer-coarse:gap-1.5`;

/** w-fit because this one sits in a flex column; the rest is the shared rule. */
const POINT_LINK = `${QUIET_DOC_LINK} w-fit`;

// A whole section: the heading and the rows it governs, so the two cannot be
// written at odds. The rows are h3s under the section's h2, one style for
// every row, which makes the ladder on a phone the 24px title, a 20px
// section heading, a 16px row and its 14px body. When the adopter rows were
// h2s at 20px they outweighed the "Za zavetišča" heading under them and the
// page read as one size again.
//
// divide-y and border-b, no top rule: the heading opens the section and a
// rule above the first row boxed it in against the rule that closed the
// section before. The bottom rule closes each section the same way.
//
// mt-px on the media: text-base carries its own 24px line-height and beats
// ItemTitle's leading-snug, so the line box is 24px against a 20px glyph
// and the true centre is 2px. A pixel high reads better than a glyph on the
// baseline, measured at -1.00px on every row here and on /o-nas/vsebine.
function AboutSection({
  id,
  section,
  className,
}: {
  id: string;
  section: AboutSectionText;
  className: string;
}) {
  return (
    <section aria-labelledby={id} className={`space-y-3 ${className}`}>
      <h2 id={id} className={SECTION_TITLE}>
        {section.title}
      </h2>
      <div className="divide-y border-b">
        {section.points.map((point) => {
          const Icon = pointIcons[point.key];
          return (
            <Item key={point.key} layout="row" className="px-0 py-5">
              <ItemMedia className="mt-px">
                <Icon className="size-5 shrink-0 text-muted-foreground" aria-hidden />
              </ItemMedia>
              <ItemContent className="break-words">
                <ItemTitle asChild className="text-base font-medium">
                  <h3>{point.title}</h3>
                </ItemTitle>
                <ItemDescription className="text-sm leading-relaxed">
                  {point.body}
                </ItemDescription>
                {point.link && (
                  <a href={point.link.href} className={POINT_LINK}>
                    {point.link.label}
                  </a>
                )}
              </ItemContent>
            </Item>
          );
        })}
      </div>
    </section>
  );
}

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
      mainClassName="grid w-full flex-1 grid-cols-1 content-start gap-section-gap py-page-y lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:gap-x-12"
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
          {/* The page's one sentence, a step under the title and level
              with nothing else: the section headings are the step above
              the facts now, and at 18px the lead competed with them. */}
          <p className={PAGE_LEAD}>
            {text.lead}
          </p>
        </div>
      </div>

      {/* One call per audience, so the heading, its rows and its place in
          the desktop column are stated once each. Adoption and availability
          stay together and readable without disclosure controls. */}
      <AboutSection
        id="about-adopters"
        section={text.adopters}
        className="lg:col-start-1 lg:row-start-2"
      />
      <AboutSection
        id="about-shelters"
        section={text.shelters}
        className="lg:col-start-1 lg:row-start-3"
      />

      {/* The closing line is for everyone: a visitor reporting an animal that
          has found a home writes to the same address a shelter does, so it
          sits after both sections rather than inside the shelters' one.

          The sentence stays beside the button rather than inside it: it says
          what to write about, and a button label that is a full sentence stops
          reading as a control.

          One button, where there used to be a second one saying "Koda na
          GitHubu" at the same size and weight beside it. A repository is not
          an answer to the sentence above, and the footer of this very page
          already invites developers, in the small print where that belongs. */}
      <div className="space-y-3 lg:col-start-1 lg:row-start-4">
        <p className="text-sm leading-relaxed text-muted-foreground">
          {text.report}
        </p>
        {/* size="wrap" is the variant written for this case, and its comment
            in ui/button.tsx says so: a contact action that wraps at narrow
            widths and at enlarged text. It was four hand-spelled utilities
            over size="sm" before. */}
        <div className="flex">
          <Button
            asChild
            variant="outline"
            size="wrap"
            className={`${THUMB_BUTTON} max-w-full`}
          >
            <a href={mailtoHref(CONTACT_EMAIL)}>
              <Mail aria-hidden data-icon="inline-start" />
              <span className="min-w-0 break-all">{CONTACT_EMAIL}</span>
            </a>
          </Button>
        </div>
      </div>

      {/* Keep the practical information first in mobile and keyboard
          reading order. On desktop the cat sits beside all four text
          rows, with the dedication directly beneath the model. */}
      <div className="lg:col-start-2 lg:row-span-4 lg:row-start-1 lg:flex lg:items-center">
        <AboutCat locale={locale} />
      </div>
    </SiteShell>
  );
}
