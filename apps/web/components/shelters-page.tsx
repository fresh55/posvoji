import { LogIn } from "lucide-react";
import { BackLink } from "@/components/back-link";
import { I18nProvider } from "@/components/i18n-provider";
import { JsonLd } from "@/components/json-ld";
import type { ShelterCardData } from "@/components/shelter-card";
import { SheltersGrid } from "@/components/shelters-grid";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { loadDataset } from "@/lib/dataset";
import { shelterAnimalsPath } from "@/lib/filters";
import { getMessages, type Locale } from "@/lib/i18n";
import { allShelters, registerDateLabel } from "@/lib/labels";
import { shelterListJsonLd } from "@/lib/shelter-jsonld";
import { homePath, shelterPath } from "@/lib/shelter-path";
import { getShelterLogos } from "@/lib/shelter-logos";
import { loadShelters, shelterRegisterDate } from "@/lib/shelters";
import { siteLinks } from "@/lib/site-links";

const pageText = {
  sl: {
    kicker: "Javni register",
    title: "Zavetišča po Sloveniji",
    back: "Živali za posvojitev",
    provider: "Deli podatke",
    contactOnly: "Le kontaktni podatki",
    website: "Spletna stran",
    email: "E-pošta",
    phone: "Telefon",
    filterLabel: "Prikaži zavetišča",
    filterWithData: "S seznamom živali",
    filterContactOnly: "Le kontakti",
    inviteTitle: "Ste zavetišče?",
    inviteBody:
      "Vaše živali objavimo z vašim dovoljenjem in povezavo na vašo objavo.",
    source: "Vir: UVHVVR — register zavetišč (gov.si)",
    asOf: "stanje",
  },
  en: {
    kicker: "Public registry",
    title: "Shelters across Slovenia",
    back: "Animals for adoption",
    provider: "Shares data",
    contactOnly: "Contact details only",
    website: "Website",
    email: "Email",
    phone: "Phone",
    filterLabel: "Show shelters",
    filterWithData: "With animal list",
    filterContactOnly: "Contact only",
    inviteTitle: "Are you a shelter?",
    inviteBody:
      "We publish your animals with your permission, linking back to your own listing.",
    source: "Source: UVHVVR — shelter registry (gov.si)",
    asOf: "as of",
  },
} satisfies Record<Locale, Record<string, string>>;

// One paragraph, and it never prints a zero. With no provider in the dataset
// there is nothing to count, and "0 zavetišč deli podatke" reads as a failure
// of the site rather than as the state of a registry we are still asking
// permission from; what the page can say honestly is that every shelter in
// the register is here with its contacts.
//
// Slovenian sidesteps a numeral's agreement in both branches. "Vseh N
// zavetišč" is genitive plural whatever N is, and the provider sentence puts
// the count after "za", where the noun stays genitive because of "od", so the
// verb is first person and agrees with nobody.
function lede(total: number, withData: number, locale: Locale): string {
  if (locale === "en") {
    const opening = `All ${total} shelters from the public UVHVVR registry, with their contact details in one place.`;
    return withData > 0
      ? `${opening} With permission, we also publish the animal list for ${withData} of them.`
      : `${opening} We publish the animal list for every shelter that gives us permission.`;
  }
  const opening = `Vseh ${total} zavetišč iz javnega registra UVHVVR, s kontakti na enem mestu.`;
  return withData > 0
    ? `${opening} Z dovoljenjem objavljamo tudi seznam živali za ${withData} od ${total} zavetišč.`
    : `${opening} Seznam živali objavimo pri vsakem zavetišču, ki nam to dovoli.`;
}

export function SheltersPage({ locale }: { locale: Locale }) {
  const shelters = loadShelters();
  const dataset = loadDataset();
  const animals = dataset?.animals ?? [];
  const logos = getShelterLogos();
  const text = pageText[locale];
  const messages = getMessages(locale);
  const homeHref = homePath(locale);
  const collator = new Intl.Collator(locale === "sl" ? "sl" : "en");

  const counts = new Map<string, number>();
  for (const animal of animals) {
    counts.set(animal.shelter.id, (counts.get(animal.shelter.id) ?? 0) + 1);
  }

  // Providers first, because they are the shelters this page can offer more
  // than a phone number for. By town inside each half, not by name: eleven of
  // the seventeen names open with the word "Zavetišče", so a name sort orders
  // most of the page by a word it prints on most of the page, while the towns
  // are all different and "which one is near me" is the question the reader
  // came with. Name breaks a tie, for the towns that hold two.
  const cards: ShelterCardData[] = shelters
    .map((shelter) => {
      const count = counts.get(shelter.id) ?? 0;
      return {
        id: shelter.id,
        name: shelter.name,
        city: shelter.city,
        href: shelterPath(shelter.id, locale),
        // The home grid reads its filters straight off the address, so a
        // plain link arrives already filtered. Only for a shelter that has
        // animals: filtering to one that has none lands on an empty grid.
        animalsHref:
          count > 0 ? shelterAnimalsPath(shelter.id, locale) : undefined,
        count,
        logo: logos[shelter.id],
        website: shelter.website,
        email: shelter.email,
        phone: shelter.phone,
      };
    })
    .sort(
      (a, b) =>
        Number(b.count > 0) - Number(a.count > 0) ||
        collator.compare(a.city, b.city) ||
        collator.compare(a.name, b.name),
    );

  const withData = cards.filter((card) => card.count > 0).length;
  // Nothing on this page tells the two kinds of shelter apart until the
  // registry holds both: one filter option would answer with an empty page,
  // and the contact-only line would print on every card.
  const mixedRegistry = withData > 0 && withData < cards.length;

  const registerDate = shelterRegisterDate();
  const asOf = registerDate
    ? registerDateLabel(registerDate, locale)
    : undefined;
  const portal = siteLinks(locale, messages).find(
    (link) => link.key === "portal",
  );

  return (
    <I18nProvider locale={locale}>
      <div className="mx-auto flex min-h-full w-full max-w-7xl flex-col px-gutter">
        <SiteHeader
          homeHref={homeHref}
          languagePaths={{ sl: "/zavetisca", en: "/en/shelters" }}
        />

        <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 py-page-y sm:gap-10">
          {/* The list in the order the page draws it, pointing at the detail
              pages that carry each shelter's own facts. */}
          <JsonLd data={shelterListJsonLd(cards, locale)} />

          <div className="space-y-5">
            <BackLink href={homeHref} label={text.back} />
            <div className="max-w-3xl space-y-3">
              <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                {text.kicker}
              </p>
              <h1 className="text-3xl font-medium tracking-tight sm:text-4xl">
                {text.title}
              </h1>
              <p className="text-base leading-relaxed text-muted-foreground sm:text-lg">
                {lede(shelters.length, withData, locale)}
              </p>
            </div>
          </div>

          <SheltersGrid
            shelters={cards}
            locale={locale}
            card={{
              provider: text.provider,
              contactOnly: text.contactOnly,
              website: text.website,
              email: text.email,
              phone: text.phone,
            }}
            filter={{
              label: text.filterLabel,
              all: allShelters(locale),
              withData: text.filterWithData,
              contactOnly: text.filterContactOnly,
            }}
            mixedRegistry={mixedRegistry}
          />

          {portal && (
            <div className="rounded-ui border border-dashed px-6 py-8 text-center">
              <p className="font-medium">{text.inviteTitle}</p>
              <p className="mx-auto mt-2 max-w-prose text-sm leading-relaxed text-muted-foreground">
                {text.inviteBody}
              </p>
              <Button asChild variant="outline" size="sm" className="mt-5">
                <a href={portal.href}>
                  <LogIn aria-hidden />
                  {portal.label}
                </a>
              </Button>
            </div>
          )}

          <p className="border-t pt-6 text-xs text-muted-foreground">
            {asOf ? `${text.source}, ${text.asOf} ${asOf}.` : `${text.source}.`}
          </p>
        </main>

        <SiteFooter locale={locale} showSheltersLink={false} />
      </div>
    </I18nProvider>
  );
}
