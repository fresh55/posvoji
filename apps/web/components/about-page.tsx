import { ArrowRight, Mail } from "lucide-react";
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
  browse: { label: string; href: string };
  adopters: AboutSectionText;
  shelters: AboutSectionText;
  /** The closing section's heading and line. The address follows the line
   *  as a button and is not translated. */
  contact: string;
  report: string;
};

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
    lead: "Na enem mestu zbiramo objave sodelujočih slovenskih zavetišč in živalim pomagamo najti dom.",
    browse: { label: "Poglej živali", href: "/" },
    adopters: {
      title: "Za posvojitelje",
      points: [
        {
          title: "Kako poteka posvojitev?",
          body: "Posvojitev vodi zavetišče, navedeno ob objavi. Z njim se pogovori o potrebah živali, svojem vsakdanu, pogojih, morebitnih stroških in spoznavanju.",
        },
        {
          title: "Ali žival še išče dom?",
          body: "Objave lahko zaostajajo za spremembami. Pred obiskom pri zavetišču preveri, ali žival še išče dom, in se dogovori za termin. Seznam ne zajema vseh živali in zavetišč.",
        },
        {
          title: "Brezplačna uporaba",
          body: "Za ogled ne potrebuješ računa. Ni oglasov ali plačanih prednostnih uvrstitev.",
        },
      ],
    },
    shelters: {
      title: "Za zavetišča",
      points: [
        {
          title: "O svojih vsebinah odločate sami",
          body: "Objave vključimo z vašim pisnim dovoljenjem, navedemo vir in obiskovalce usmerimo k vam. Sami določite, ali smemo prikazati fotografije in koliko opisa. Kadarkoli lahko zahtevate popravek, umik vsebin ali prenehanje sodelovanja.",
          link: { label: "O vsebinah in dovoljenjih", href: DATA_POLICY_PATHS.sl },
        },
        {
          title: "Kako se zavetišče vključi?",
          body: "Sodelovanje je brezplačno. Vključimo objave z vaše spletne strani ali omogočimo neposreden vnos, če svojega seznama živali nimate. Za sodelovanje in dostop do portala nam pišite.",
          link: { label: "Že imate dostop? Prijava za zavetišča", href: "/portal/prijava" },
        },
      ],
    },
    contact: "Kontakt",
    report:
      "Si opazil napako ali je žival že našla dom? Pošlji povezavo do objave in povej, kaj je treba popraviti. Na isti naslov pišejo tudi zavetišča.",
  },
  en: {
    lead: "We bring participating Slovenian shelters’ listings together to help animals find homes.",
    browse: { label: "Browse animals", href: "/en" },
    adopters: {
      title: "For adopters",
      points: [
        {
          title: "Adoption goes through the shelter",
          body: "Contact the shelter listed with the animal about its needs, adoption requirements and any costs. The shelter handles adoption.",
        },
        {
          title: "Before visiting, check whether the animal still needs a home",
          body: "Listings may lag behind changes. Confirm availability and arrange a time with the shelter. We do not list every animal or shelter.",
        },
        {
          title: "Free browsing, no account needed",
          body: "There are no ads or paid priority listings.",
        },
      ],
    },
    shelters: {
      title: "For shelters",
      points: [
        {
          title: "You stay in control of your content",
          body: "We need your written permission, credit the source and direct visitors to you. You decide whether we may show photos and how much of a description we display. You can request corrections or removal, or end participation at any time.",
          link: { label: "Content and permissions", href: DATA_POLICY_PATHS.en },
        },
        {
          title: "How can you join?",
          body: "Participation is free. We can include your website’s listings or offer direct entry if you have no catalogue. Email us to join or arrange portal access.",
          link: { label: "Already have access? Shelter login", href: "/portal/prijava" },
        },
      ],
    },
    contact: "Contact",
    report:
      "Spotted a mistake, or has an animal already found a home? Send us the listing link and tell us what needs correcting. Shelters use the same address.",
  },
};

// Small buttons grown to 44px on a coarse pointer, the same spelling the
// shelters page gives its lookup button and for the reason argued there: a
// thumb needs the height, and the padding goes with it or the box reads as a
// stretched pill. On the pointer and not on the width, because a 1180px
// tablet is a thumb and a 1024px laptop window is not.
const THUMB_BUTTON = `${COARSE_ACTION} pointer-coarse:gap-1.5`;

/** Fit the text while keeping wrapped links inside their content column. */
const POINT_LINK = `${QUIET_DOC_LINK} w-fit max-w-full`;

// Preserve the heading hierarchy and use spacing to separate the facts.
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
    <section aria-labelledby={id} className={`space-y-4 ${className}`}>
      <h2 id={id} className={SECTION_TITLE}>
        {section.title}
      </h2>
      <div className="space-y-6">
        {section.points.map((point) => {
          return (
            <Item key={point.title} layout="row" className="p-0">
              <ItemContent className="break-words">
                <ItemTitle asChild className="text-base font-medium">
                  <h3>{point.title}</h3>
                </ItemTitle>
                <ItemDescription className="text-sm leading-relaxed sm:text-base sm:leading-relaxed">
                  {point.body}
                </ItemDescription>
                {point.link && (
                  <a
                    href={point.link.href}
                    className={POINT_LINK}
                  >
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
        <Button
          asChild
          size="wrap"
          className={`${THUMB_BUTTON} w-fit max-w-full`}
        >
          <a href={text.browse.href}>
            {text.browse.label}
            <ArrowRight aria-hidden data-icon="inline-end" />
          </a>
        </Button>
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

      {/* One contact address serves visitors and shelters.

          The sentence stays beside the button rather than inside it: it says
          what to write about, and a button label that is a full sentence stops
          reading as a control.

          One button, where there used to be a second one saying "Koda na
          GitHubu" at the same size and weight beside it. A repository is not
          an answer to the sentence above, and the footer of this very page
          already invites developers, in the small print where that belongs. */}
      <section
        aria-labelledby="about-contact"
        className="space-y-3 lg:col-start-1 lg:row-start-4"
      >
        <h2 id="about-contact" className={SECTION_TITLE}>
          {text.contact}
        </h2>
        <p className="text-sm leading-relaxed text-muted-foreground sm:text-base sm:leading-relaxed">
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
      </section>

      {/* Keep the practical information first in mobile and keyboard
          reading order. On desktop the cat sits beside all four text
          rows, with the dedication directly beneath the model.

          Top-aligned with the title and sticky, not centred. Centred on the
          whole column it floated beside the second row with empty space
          above it, level with nothing. Sticky keeps the dedication in view
          while the facts beside it scroll. */}
      <div className="lg:sticky lg:top-8 lg:col-start-2 lg:row-span-4 lg:row-start-1 lg:self-start">
        <AboutCat locale={locale} />
      </div>
    </SiteShell>
  );
}
