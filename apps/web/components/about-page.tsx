import { I18nProvider } from "@/components/i18n-provider";
import { PageBreadcrumb } from "@/components/page-breadcrumb";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { mailtoHref } from "@/lib/contact-links";
import { CONTACT_EMAIL } from "@/lib/site";
import { getMessages, type Locale } from "@/lib/i18n";
import { homePath } from "@/lib/shelter-path";
import { ABOUT_PATHS } from "@/lib/site-links";

// Where a correction goes. Printed as the address itself rather than behind
// a word: a reader writing from their own mail client has to be able to read
// it off the page, and the one string is then both the link and its text.

type PageText = {
  lead: string;
  points: { title: string; body: string }[];
  /** The closing line. The address follows it and is not translated. */
  report: string;
};

// The same facts README.sl.md and the footer already state, said once in
// full. Nothing here that the code cannot back: no ads and no tracking
// because there is no third-party script on the site, no accounts because
// the site has none for visitors, no payment for a place because there is
// no mechanism for one.
const pageText: Record<Locale, PageText> = {
  sl: {
    lead: "Posvoji.si je odprt in brezplačen seznam živali iz slovenskih zavetišč, ki iščejo dom.",
    points: [
      {
        title: "Brezplačno",
        body: "Za obiskovalce in za zavetišča. Brez oglasov, brez računov in brez sledenja. Nihče ne plača za uvrstitev ali za boljše mesto na seznamu.",
      },
      {
        title: "Odprta koda",
        body: "Vsa koda je javna na GitHubu. Vsak lahko preveri, kako stran deluje in kaj določa vrstni red živali.",
      },
      {
        title: "Podatki zavetišč",
        body: "Prikažemo samo, kar zavetišče dovoli. Pri vsaki živali sta navedena vir in povezava na izvorno objavo.",
      },
      {
        title: "Posvojitev pri zavetišču",
        body: "Posvoji.si ni zavetišče in ne vodi posvojitev. O vsaki živali odloča zavetišče, ki zanjo skrbi.",
      },
      {
        title: "Brez osebnih podatkov",
        body: "Zasebni oglasi, kontakti posameznikov in številke mikročipov ne sodijo na to stran.",
      },
    ],
    report:
      "Napačen podatek, zastarela objava ali žival, ki je že našla dom? Pišite nam na",
  },
  en: {
    lead: "Posvoji.si is an open, free index of animals waiting for a home in Slovenian shelters.",
    points: [
      {
        title: "Free",
        body: "For visitors and for shelters. No ads, no accounts and no tracking. Nobody pays to be listed or to rank higher.",
      },
      {
        title: "Open source",
        body: "All the code is public on GitHub. Anyone can check how the site works and what decides the order of the animals.",
      },
      {
        title: "Data from shelters",
        body: "We show only what a shelter allows. Every animal names its source and links to the original listing.",
      },
      {
        title: "Adoption at the shelter",
        body: "Posvoji.si is not a shelter and does not handle adoptions. The shelter caring for an animal decides about it.",
      },
      {
        title: "No personal data",
        body: "Private listings, individuals’ contact details and microchip numbers do not belong here.",
      },
    ],
    report:
      "Wrong detail, stale listing or an animal that already found a home? Write to us at",
  },
};

/**
 * What the site is, in one screen. A heading, one sentence, five facts and a
 * way to report a mistake. No cards, no marks, no picture: the facts are the
 * page, and the grid a click away is what they are about.
 */
export function AboutPage({ locale }: { locale: Locale }) {
  const messages = getMessages(locale);
  const text = pageText[locale];
  const homeHref = homePath(locale);

  return (
    <I18nProvider locale={locale}>
      <div className="mx-auto flex min-h-dvh w-full max-w-7xl flex-col px-gutter">
        <SiteHeader homeHref={homeHref} languagePaths={ABOUT_PATHS} />

        <main className="flex w-full max-w-2xl flex-1 flex-col gap-8 py-page-y sm:gap-10">
          <div className="space-y-5">
            <PageBreadcrumb locale={locale} current={messages.about} />
            <div className="space-y-3">
              <h1 className="text-3xl font-medium tracking-tight sm:text-4xl">
                {messages.about}
              </h1>
              <p className="text-base leading-relaxed text-muted-foreground sm:text-lg">
                {text.lead}
              </p>
            </div>
          </div>

          {/* A rule between facts and nothing else. The term keeps to its own
              column from sm, so the eye runs down five short labels and reads
              the one it wants; below that the two stack. */}
          <div className="divide-y border-y">
            {text.points.map((point) => (
              <section
                key={point.title}
                className="grid gap-1.5 py-5 sm:grid-cols-[12rem_1fr] sm:gap-8"
              >
                <h2 className="text-base font-medium">{point.title}</h2>
                <p className="text-base leading-relaxed text-muted-foreground">
                  {point.body}
                </p>
              </section>
            ))}
          </div>

          <p className="text-sm leading-relaxed text-muted-foreground">
            {text.report}{" "}
            <a
              href={mailtoHref(CONTACT_EMAIL)}
              className="font-medium text-foreground underline-offset-4 hover:underline max-lg:tap-target"
            >
              {CONTACT_EMAIL}
            </a>
          </p>
        </main>

        {/* The one footer that does not link to this page, because it is on
            it. */}
        <SiteFooter locale={locale} showAboutLink={false} />
      </div>
    </I18nProvider>
  );
}
