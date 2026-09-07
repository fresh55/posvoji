import { Eye, Printer } from "lucide-react";
import Image from "next/image";
import { Fragment } from "react";
import { I18nProvider } from "@/components/i18n-provider";
import { ModelCredit } from "@/components/model-credit";
import { PageBreadcrumb } from "@/components/page-breadcrumb";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { HEALTH_ICONS, SPECIES_ICONS } from "@/lib/animal-icons";
import { EMPTY_FILTERS, serializeFilters, toggleLabel } from "@/lib/filters";
import { getMessages, type Locale } from "@/lib/i18n";
import {
  ageLabel,
  META_DOT_CLASS,
  META_SEPARATOR,
  speciesLabel,
} from "@/lib/labels";
import { homePath } from "@/lib/shelter-path";
import { ABOUT_PATHS } from "@/lib/site-links";
import {
  SRECKO,
  SRECKO_PATHS,
  SRECKO_POSTER_PATHS,
  sreckoDateLabel,
  sreckoMonthsAtHome,
  type SreckoEventKey,
} from "@/lib/srecko";

// The render the about page shows before the model loads, and the only
// picture of him the site has until the photographs are prepared. No version
// query: components/about-cat.tsx carries one because the still and the model
// it stands in for are swapped as a pair, and there is no model here.
const STILL = "/models/our-cat/poster.webp";

type PageText = {
  /** The card's fact line, and the card's rule: two facts and no third.
   *
   *  Sex and the virus, and neither locale repeats the species. The badge
   *  directly above says "Mačka" and "Cat"; a line that opened with the same
   *  word said it twice in a row, which is what animalMetaParts drops the
   *  species for on a tab that has already named it.
   *
   *  Slovenian says both facts in one word, because "maček" is a male cat.
   *  English has no such word, so it takes the sex filter's own label for
   *  "male". Written out rather than read off sexLabel, because Srecko.sex is
   *  the schema's Sex and that includes "unknown", which the label function
   *  refuses; a cast to get past it would buy nothing but a cast. */
  meta: [string, string];
  stillAlt: string;
  eyeTitle: string;
  eyeBody: string;
  felvTitle: string;
  felvBody: string;
  /** The site's own filter, named as the site names it, and what a positive
   *  result means on a list ordered by how long an animal has waited. */
  argument: (filter: string) => string;
  eventsTitle: string;
  events: Record<SreckoEventKey, string>;
  atHome: (duration: string) => string;
  cats: string;
  /** The same words the animal page gives its own sheet. */
  poster: string;
  /** Word for word the line the about page ends on, because it is the line
   *  that leads here. Written out rather than imported: about-page.tsx keeps
   *  its copy private, and the test on each page quotes the sentence, so a
   *  change to one without the other is a red test rather than a drift. */
  dedication: string;
};

const copy: Record<Locale, PageText> = {
  sl: {
    meta: ["Maček", "s FeLV"],
    stillAlt:
      "Upodobitev Srečka: bel maček s sivimi lisami in zaprtim desnim očesom.",
    eyeTitle: "Eno oko",
    eyeBody:
      "Desnega očesa ni imel. Izgubil ga je, preden je prišel na seznam, in rana se je zacelila.",
    felvTitle: "FeLV pozitiven",
    felvBody:
      "Test na virus mačje levkemije je bil pozitiven. To je vse, kar je o njegovem zdravju zapisano.",
    argument: (filter) =>
      `Filter »${filter}« na tem seznamu ujame samo mačke, ki so bile testirane negativno. Pozitivna mačka je tista, ki jo ta filter skrije, in tista, ki jo zavetišče najtežje odda. Na seznamu, kjer mesta ni mogoče kupiti, je bil Srečko uvrščen enako kot vsak mladiček.`,
    eventsTitle: "Kaj se je zgodilo",
    events: {
      listed: "V zavetišču",
      adopted: "Posvojen",
      died: "Umrl",
    },
    atHome: (duration) => `Doma je bil ${duration}.`,
    cats: "Mačke, ki še čakajo",
    poster: "Natisni plakat",
    dedication: "Ta stran je v spomin na Srečka.",
  },
  en: {
    meta: ["Male", "with FeLV"],
    stillAlt:
      "A render of Srečko: a white cat with grey patches and a closed right eye.",
    eyeTitle: "One eye",
    eyeBody:
      "He had no right eye. He lost it before he was listed, and the wound healed over.",
    felvTitle: "FeLV positive",
    felvBody:
      "He tested positive for feline leukemia virus. That is all that is recorded about his health.",
    argument: (filter) =>
      `The “${filter}” filter on this list matches only cats that tested negative. A positive cat is the one that filter hides and the one a shelter has the hardest time placing. On a list where nobody can buy a place, Srečko ranked the same as every kitten.`,
    eventsTitle: "What happened",
    events: {
      listed: "In the shelter",
      adopted: "Adopted",
      died: "Died",
    },
    atHome: (duration) => `He was home for ${duration}.`,
    cats: "Cats still waiting",
    poster: "Print poster",
    dedication: "This site is in memory of Srečko.",
  },
};

// The two facts his page states, each with the glyph the site already uses for
// it. FeLV borrows the filter panel's own mark, so the virus wears one symbol
// wherever it is named; the eye has no prior mark because no listing carries
// the fact.
const FACT_ICONS = {
  eye: Eye,
  felv: HEALTH_ICONS["brez-felv"],
} as const;

// Grown to 44px below lg, the same spelling and the same reason the about page
// gives beside its own buttons.
const THUMB_BUTTON = "max-lg:min-h-11 max-lg:gap-1.5 max-lg:px-4";

// The quiet way on, drawn exactly as the animal page draws its own poster
// link. The two sheets are the same thing, so they are reached the same way.
const QUIET_LINK =
  "inline-flex items-center gap-1.5 rounded-ui text-sm text-muted-foreground underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring max-lg:tap-target";

/**
 * Where the about page's dedication leads.
 *
 * He is presented the way the site presents an animal, because that is what he
 * was on it: a name, the species badge, a status and two facts. Everything
 * printed here comes from lib/srecko.ts, so the page and his sheet cannot
 * state a fact two ways, and nothing names the shelter he came from or the
 * household he went to.
 */
export function SreckoPage({ locale }: { locale: Locale }) {
  const messages = getMessages(locale);
  const text = copy[locale];
  const homeHref = homePath(locale);
  const CatIcon = SPECIES_ICONS[SRECKO.species];

  // Built through serializeFilters rather than spelled out, for the reason
  // shelterAnimalsPath gives in lib/filters/url.ts: the param name is private
  // there and a hand-written key would keep working as a link while quietly
  // filtering nothing. No sort param, because the default order is the longest
  // wait, which is the order this link is offered in.
  const catsHref = `${homeHref}?${serializeFilters({
    ...EMPTY_FILTERS,
    species: "cat",
  })}`;

  const monthsAtHome = sreckoMonthsAtHome(SRECKO.timeline);
  // One boolean for the picture and for the credit under it. CC BY asks for
  // the attribution to travel with the work, so the footer carries it exactly
  // when the page is drawing the model's render.
  const showsStill = SRECKO.photos.length === 0;

  return (
    <I18nProvider locale={locale}>
      <div className="mx-auto flex min-h-dvh w-full max-w-7xl flex-col px-gutter">
        <SiteHeader homeHref={homeHref} languagePaths={SRECKO_PATHS} />

        <main className="flex w-full max-w-3xl flex-1 flex-col gap-8 py-page-y">
          {/* The trail reaches him through the page that sends readers here,
              which is also the shape of the URL. space-y-5 rather than the
              main's gap-8, so the trail sits the same 20px above its page as
              it does everywhere else. */}
          <div className="space-y-5">
            <PageBreadcrumb
              locale={locale}
              trail={[{ label: messages.about, href: ABOUT_PATHS[locale] }]}
              current={SRECKO.name}
            />

            <div className="space-y-2">
              <h1 className="text-2xl font-medium tracking-tight sm:text-3xl">
                {SRECKO.name}
              </h1>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">
                  {speciesLabel(SRECKO.species, locale)}
                </Badge>
                {/* From the status in lib/srecko.ts through labels.ts, never
                    typed here: the word for an adopted animal is the site's
                    to choose and it chooses it in one place. */}
                <StatusBadge status={SRECKO.status} locale={locale} />
              </div>
              <p className="text-sm text-muted-foreground">
                {text.meta.map((fact, index) => (
                  <Fragment key={fact}>
                    {index > 0 && (
                      <span className={META_DOT_CLASS}>{META_SEPARATOR}</span>
                    )}
                    {fact}
                  </Fragment>
                ))}
              </p>
            </div>
          </div>

          {/* His photographs when there are any, oldest first: a strip that
              scrolls under a thumb on a phone, a grid once there is room for
              one. Until then the same render the about page shows, which is
              what the site has of him. No empty frame and no note promising
              pictures later: a page that says it is missing something is worse
              than a page that shows what it has. */}
          {!showsStill ? (
            <ul className="flex snap-x gap-3 overflow-x-auto max-lg:bleed lg:grid lg:grid-cols-3 lg:overflow-visible">
              {SRECKO.photos.map((photo) => (
                <li
                  key={photo.src}
                  className="w-64 shrink-0 snap-start lg:w-auto"
                >
                  <Image
                    src={photo.src}
                    alt={photo.alt[locale]}
                    width={photo.width}
                    height={photo.height}
                    sizes="(min-width: 1024px) 14rem, 16rem"
                    className="h-auto w-full rounded-ui border"
                  />
                </li>
              ))}
            </ul>
          ) : (
            <div className="relative mx-auto h-80 w-full max-w-sm sm:h-[26rem]">
              <Image
                src={STILL}
                alt={text.stillAlt}
                fill
                sizes="(min-width: 640px) 24rem, 100vw"
                className="object-contain"
              />
            </div>
          )}

          {/* The about page's list grammar: a rule between facts and nothing
              else, one glyph each, and only the padding is the page's so the
              rules run edge to edge. mt-px on the media for the measurement
              made there: a 20px glyph on a 22px line box. */}
          <div className="divide-y border-y">
            <Item layout="row" className="px-0 py-5">
              <ItemMedia className="mt-px">
                <FACT_ICONS.eye
                  className="size-5 shrink-0 text-muted-foreground"
                  aria-hidden
                />
              </ItemMedia>
              <ItemContent>
                <ItemTitle asChild className="text-base font-medium">
                  <h2>{text.eyeTitle}</h2>
                </ItemTitle>
                <ItemDescription className="text-sm leading-relaxed">
                  {text.eyeBody}
                </ItemDescription>
              </ItemContent>
            </Item>

            <Item layout="row" className="px-0 py-5">
              <ItemMedia className="mt-px">
                <FACT_ICONS.felv
                  className="size-5 shrink-0 text-muted-foreground"
                  aria-hidden
                />
              </ItemMedia>
              <ItemContent>
                <ItemTitle asChild className="text-base font-medium">
                  <h2>{text.felvTitle}</h2>
                </ItemTitle>
                <ItemDescription className="text-sm leading-relaxed">
                  {text.felvBody}
                </ItemDescription>
              </ItemContent>
            </Item>
          </div>

          {/* What the positive result meant on this list, in the site's own
              words for its own control. Under the facts rather than inside the
              FeLV one, because it is not a fact about him: it is what the
              filter above the grid does, and it is the reason his page is
              worth reading by somebody who came for a cat. */}
          <p className="text-sm leading-relaxed text-muted-foreground">
            {text.argument(toggleLabel("brez-felv", locale))}
          </p>

          <div className="space-y-3">
            <h2 className="text-base font-medium">{text.eventsTitle}</h2>
            {/* An ordered list and not a drawn timeline. Three moments, in
                order, is a list; a rail with dots on it would be a graphic
                standing in for one, and two of the three have no date to
                hang on it. A date prints when there is one and the line
                reads without it. */}
            <ol className="space-y-2 text-sm">
              {SRECKO.timeline.map((event) => {
                const date = event.date
                  ? sreckoDateLabel(event.date, locale)
                  : undefined;
                return (
                  <li
                    key={event.key}
                    className="flex flex-wrap items-baseline gap-x-2"
                  >
                    <span>{text.events[event.key]}</span>
                    {date && (
                      <>
                        <span className={META_DOT_CLASS} aria-hidden>
                          ·
                        </span>
                        <span className="text-muted-foreground">{date}</span>
                      </>
                    )}
                  </li>
                );
              })}
            </ol>
            {/* Derived from the two dates above rather than stored, so the
                span cannot disagree with them. Absent while either is. */}
            {monthsAtHome !== undefined && (
              <p className="text-sm text-muted-foreground">
                {text.atHome(ageLabel(monthsAtHome, locale))}
              </p>
            )}
          </div>

          {/* The way on, and it is the point of the page: the cats on the list
              now. The sheet beside it is the quiet second one, drawn as the
              animal page draws its own so the two are recognisably one thing.
              The gap is wide enough that they read as two controls rather than
              one wrapped line, and they stack where they cannot both fit. */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <Button asChild variant="outline" size="sm" className={THUMB_BUTTON}>
              <a href={catsHref}>
                <CatIcon aria-hidden />
                {text.cats}
              </a>
            </Button>
            <a href={SRECKO_POSTER_PATHS[locale]} className={QUIET_LINK}>
              <Printer className="size-4 shrink-0" aria-hidden />
              {text.poster}
            </a>
          </div>

          {/* The line that leads here, said again where it lands, and last on
              this page as it is last on that one. */}
          <p className="border-t pt-6 text-sm leading-relaxed text-muted-foreground">
            {text.dedication}
          </p>
        </main>

        <SiteFooter locale={locale}>
          {showsStill && <ModelCredit locale={locale} />}
        </SiteFooter>
      </div>
    </I18nProvider>
  );
}
