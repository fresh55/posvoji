import {
  DoorOpen,
  EyeOff,
  FileCheck,
  Link2,
  type LucideIcon,
  ShieldCheck,
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
  PAGE_LEAD,
  PAGE_TITLE,
} from "@/lib/link-styles";
import { CONTACT_EMAIL } from "@/lib/site";
import { ABOUT_PATHS, DATA_POLICY_PATHS } from "@/lib/site-links";

// A plain-language summary of docs/DATA-POLICY.md. Keep the permissions and
// removal commitments aligned with that policy; implementation details stay there.
const CONTACT_HREF = mailtoHref(CONTACT_EMAIL);

const ruleIcons = {
  permission: FileCheck,
  ownership: ShieldCheck,
  source: Link2,
  visitor: EyeOff,
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
};

const pageText: Record<Locale, PageText> = {
  sl: {
    title: "Vsebine in dovoljenja",
    lead: "Kako ravnamo z objavami zavetišč in kako nas opozorite na napako ali zahtevate umik.",
    rules: [
      {
        key: "permission",
        title: "Najprej dovoljenje zavetišča",
        body: "Objave živali vključimo šele s pisnim dovoljenjem zavetišča. Podatke o živalih dobimo od zavetišč, z njihovih spletnih strani ali neposredno od njih. Zasebnih oglasov za oddajo živali ne objavljamo.",
      },
      {
        key: "ownership",
        title: "Vaše vsebine ostanejo vaše",
        body: "Zavetišče določi, katere fotografije in koliko opisa smemo prikazati. Za logotip in fotografije ob deljenju povezav potrebujemo ustrezno dovoljenje. Objava pri nas drugim ne daje dovoljenja za ponovno uporabo fotografij in besedil.",
      },
      {
        key: "source",
        title: "Ob vsaki živali je navedeno zavetišče",
        body: "Dodamo povezavo do izvorne objave; če zavetišče žival objavi neposredno pri nas, je izvorna objava na Posvoji.si. Podatki se lahko medtem spremenijo. O živali in posvojitvi se zato vedno pogovorite z zavetiščem, ki zanjo skrbi.",
      },
      {
        key: "visitor",
        title: "Zasebnost obiskovalcev",
        body: "Za ogled ne potrebujete računa. Na strani ni oglasov ali sledilcev. Če dovolite uporabo lokacije, jo uporabimo za prikaz živali po bližini in je ne shranimo. Podatkov zasebnih lastnikov, posvojiteljev ali prosilcev ne zbiramo in ne objavljamo.",
      },
      {
        key: "exit",
        title: "Popravek ali umik? Pišite nam.",
        body: "Če opazite napako, nam pošljite povezavo do objave in povejte, kaj je treba popraviti. Zavetišča lahko kadarkoli zahtevate spremembo prikaza, umik fotografij ali drugih vsebin ter prenehanje sodelovanja. Zahteve za umik obravnavamo prednostno.",
        contact: "Dosegljivi smo na",
      },
    ],
  },
  en: {
    title: "Content and permissions",
    lead: "How we use shelter listings, and how to ask for a correction or removal.",
    rules: [
      {
        key: "permission",
        title: "Shelter permission comes first",
        body: "We include animal listings only with the shelter’s written permission. Information comes from shelters, either through their websites or directly from them. We do not publish private rehoming ads.",
      },
      {
        key: "ownership",
        title: "Your content stays yours",
        body: "The shelter decides which photos and how much of a description we may show. Using its logo or photos in shared link previews also requires permission. Publication here does not give others permission to reuse the photos or text.",
      },
      {
        key: "source",
        title: "Every animal’s shelter is named",
        body: "We link to the original listing. When a shelter lists an animal directly with us, the original is on Posvoji.si. Details can change, so always talk to the shelter caring for the animal about its needs and adoption.",
      },
      {
        key: "visitor",
        title: "Your privacy",
        body: "You do not need an account to browse. There are no ads or trackers. If you allow location access, we use it to show nearby animals and do not store it. We do not collect or publish information about private owners, adopters or applicants.",
      },
      {
        key: "exit",
        title: "Need a correction or removal?",
        body: "If you spot a mistake, send us the listing link and tell us what needs correcting. Shelters can request changes, removal of photos or other content, or an end to their participation at any time. We give removal requests priority.",
        contact: "Email us at",
      },
    ],
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
          <p className={PAGE_LEAD}>
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
                <ItemDescription className="text-base leading-relaxed">
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
    </SiteShell>
  );
}
