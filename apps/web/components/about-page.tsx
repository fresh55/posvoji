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
import { COARSE_ACTION, PAGE_TITLE, QUIET_DOC_LINK } from "@/lib/link-styles";
import { CONTACT_EMAIL } from "@/lib/site";
import { ABOUT_PATHS, DATA_POLICY_PATHS } from "@/lib/site-links";

type PageText = {
  lead: string;
  sheltersTitle: string;
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
  shelterDecides: PawPrint,
  freshness: Clock3,
  shelterJoin: Building2,
} satisfies Record<string, LucideIcon>;

type PointKey = keyof typeof pointIcons;

// Practical guidance for adopters and shelters, grounded in DATA-POLICY.md.
// Do not promise live availability or a refresh interval: sources can lag.
// Browsing needs no account; shelters have a separate portal login.
const pageText: Record<Locale, PageText> = {
  sl: {
    lead: "Želimo, da bi živali iz zavetišč lažje našle dom. Zato na enem mestu zbiramo objave sodelujočih slovenskih zavetišč.",
    sheltersTitle: "Za zavetišča",
    points: [
      {
        key: "shelterDecides",
        title: "Želite posvojiti?",
        body: "Ob vsaki objavi je navedeno zavetišče, ki za žival skrbi. Z njim se pogovorite o njenih potrebah, svojem vsakdanu in spoznavanju. Zavetišče vam pojasni pogoje in morebitne stroške ter vodi posvojitev.",
        link: { label: "Poiščite žival, ki išče dom", href: "/" },
      },
      {
        key: "freshness",
        title: "Ali žival še išče dom?",
        body: "Objave se lahko spremenijo, preden se sprememba pokaže pri nas. Pred obiskom pri zavetišču preverite, ali je žival še na voljo, in se dogovorite za termin. Naš seznam ne zajema vseh živali in zavetišč.",
      },
      {
        key: "free",
        title: "Brezplačna uporaba",
        body: "Ogled živali in sodelovanje zavetišč sta brezplačna. Za ogled ne potrebujete računa. Na strani ni oglasov ali plačanih prednostnih uvrstitev.",
      },
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
    report:
      "Ste opazili napako ali je žival že našla dom? Pošljite nam povezavo do objave in povejte, kaj je treba popraviti. Na isti naslov nam lahko pišete za sodelovanje, umik vsebin ali predlog.",
  },
  en: {
    lead: "We want to help shelter animals find a home. Posvoji.si brings listings from participating Slovenian shelters together in one place.",
    sheltersTitle: "For shelters",
    points: [
      {
        key: "shelterDecides",
        title: "Want to adopt?",
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

function isShelterPoint(point: PageText["points"][number]) {
  return point.key === "shelterData" || point.key === "shelterJoin";
}

function AboutPoints({
  points,
  level,
}: {
  points: PageText["points"];
  level: 2 | 3;
}) {
  const Heading = level === 2 ? "h2" : "h3";
  return (
    <div className="divide-y border-y">
      {points.map((point) => {
        const Icon = pointIcons[point.key];
        return (
          <Item key={point.key} layout="row" className="px-0 py-5">
            <ItemMedia className={level === 2 ? "mt-1" : "mt-px"}>
              <Icon className="size-5 shrink-0 text-muted-foreground" aria-hidden />
            </ItemMedia>
            <ItemContent className="break-words">
              <ItemTitle asChild className={level === 2 ? "text-xl font-semibold" : "text-base font-medium"}>
                <Heading id={`about-${point.key}`}>{point.title}</Heading>
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
      mainClassName="grid w-full flex-1 grid-cols-1 content-start gap-8 py-page-y sm:gap-10 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:gap-x-12"
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
        </div>
      </div>

      {/* Keep adoption and availability together and readable without disclosure controls. */}
      <section aria-labelledby="about-shelterDecides" className="lg:col-start-1 lg:row-start-2">
        <AboutPoints points={text.points.filter((point) => !isShelterPoint(point))} level={2} />
      </section>

      {/* The sentence stays beside the button rather than inside it: it says
          what to write about, and a button label that is a full sentence stops
          reading as a control.

          One button, where there used to be a second one saying "Koda na
          GitHubu" at the same size and weight beside it. The sentence above is
          addressed to shelters, and a repository is not an answer to it: the
          reader it was for is a developer, and the footer of this very page
          already invites them, in the small print where that belongs. */}
      <section aria-labelledby="about-shelters" className="space-y-3 lg:col-start-1 lg:row-start-3">
        <h2 id="about-shelters" className="text-xl font-semibold">
          {text.sheltersTitle}
        </h2>
        <AboutPoints points={text.points.filter(isShelterPoint)} level={3} />
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
            className={`${THUMB_BUTTON} h-auto min-h-9 max-w-full whitespace-normal`}
          >
            <a href={mailtoHref(CONTACT_EMAIL)}>
              <Mail aria-hidden data-icon="inline-start" />
              <span className="min-w-0 break-all">{CONTACT_EMAIL}</span>
            </a>
          </Button>
        </div>
      </section>

      {/* Keep the practical information first in mobile and keyboard
          reading order. On desktop the cat sits beside all three text
          rows, with the dedication directly beneath the model. */}
      <div className="lg:col-start-2 lg:row-span-3 lg:row-start-1 lg:flex lg:items-center">
        <AboutCat locale={locale} />
      </div>
    </SiteShell>
  );
}
