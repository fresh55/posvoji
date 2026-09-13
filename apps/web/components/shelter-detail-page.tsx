import {
  ExternalLink,
  Globe,
  Info,
  type LucideIcon,
  Mail,
  MapPin,
  Phone,
} from "lucide-react";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { BackToTop } from "@/components/back-to-top";
import { PageBreadcrumb } from "@/components/page-breadcrumb";
import { JsonLd } from "@/components/json-ld";
import { ShelterAnimalGrid } from "@/components/shelter-animal-grid";
import { ShelterAvatar } from "@/components/shelter-avatar";
import { ShelterLocationMap } from "@/components/shelter-location-map";
import { SiteFooter } from "@/components/site-footer";
import { SiteShell } from "@/components/site-shell";
import { Button } from "@/components/ui/button";
import {
  contactName,
  mailtoHref,
  telHref,
  websiteName,
} from "@/lib/contact-links";
import { animalsForClient, loadDataset, shelterAnimals } from "@/lib/dataset";
import { shelterAnimalsPath } from "@/lib/filters";
import { getMessages, type Locale } from "@/lib/i18n";
import { animalCount, META_DOT_CLASS, registerDateLabel } from "@/lib/labels";
import { MUTED_LINK } from "@/lib/link-styles";
import { shelterJsonLd } from "@/lib/shelter-jsonld";
import { sheltersIndexPath } from "@/lib/shelter-path";
import { getShelterLogos } from "@/lib/shelter-logos";
import { getShelterBySlug, shelterRegisterDate } from "@/lib/shelters";

// This page's own copy, and only its own. The three channel names are in the
// catalogue (lib/i18n.ts) because the register card speaks them too, and one
// shelter described in two vocabularies is the drift messages.shelters is
// already here to end.
const pageText = {
  sl: {
    animalsTitle: "Živali iz tega zavetišča",
    registryNotice:
      "Za to zavetišče na Posvoji.si trenutno ni objav živali. To ne pomeni, da v zavetišču ni živali za posvojitev. Za več informacij se obrni neposredno na zavetišče.",
    mapLabel: "Lega zavetišča na zemljevidu Slovenije",
    openInSearch: "Odpri v iskalniku živali",
    source: "Vir: UVHVVR — register zavetišč (gov.si)",
    asOf: "stanje",
  },
  en: {
    animalsTitle: "Animals from this shelter",
    registryNotice:
      "There are currently no animal listings from this shelter on Posvoji.si. This does not mean the shelter has no animals for adoption. Contact the shelter directly for more information.",
    mapLabel: "The shelter's location on a map of Slovenia",
    openInSearch: "Open in the animal search",
    source: "Source: UVHVVR — shelter registry (gov.si)",
    asOf: "as of",
  },
} satisfies Record<Locale, Record<string, string>>;

// Contact text must remain readable at narrow widths and enlarged font sizes.
// Grow the button when it wraps, and keep each contact large enough to tap.
const CONTACT_BUTTON =
  "h-auto min-h-11 min-w-0 max-w-full whitespace-normal py-2";

/**
 * One way to reach this shelter.
 *
 * Written once because the shape is a contract, not a style: the visible
 * label, the accessible name that puts the channel in front of it (WCAG
 * 2.5.3), and the data-contact the tests select on have to agree across all
 * three, and a fourth channel added later must not arrive wearing its own
 * version of them. data-contact is a test contract, the same as on the
 * register card's rows; nothing in the app reads it.
 *
 * The register card renders the same three as quiet rows rather than buttons,
 * and that difference is deliberate: there it is a card being scanned, here it
 * is the page's own set of actions.
 */
function ContactButton({
  channel,
  href,
  icon: Icon,
  label,
  external = false,
  children,
}: {
  channel: "phone" | "email" | "website";
  href: string;
  icon: LucideIcon;
  /** The finished accessible name, channel included. */
  label: string;
  /** Leaves the site. target="_blank" announces nothing on its own, so the
   *  name says so and the mark says it to everyone else: a title would leave
   *  the fact to a hover, which a thumb never performs. */
  external?: boolean;
  children: ReactNode;
}) {
  return (
    <Button asChild variant="outline" size="sm" className={CONTACT_BUTTON}>
      <a
        href={href}
        data-contact={channel}
        aria-label={label}
        {...(external && { target: "_blank", rel: "noreferrer" })}
      >
        <Icon aria-hidden />
        <span className="min-w-0 [overflow-wrap:anywhere]">{children}</span>
        {external && (
          <ExternalLink
            data-external
            className="size-3.5 text-muted-foreground"
            aria-hidden
          />
        )}
      </a>
    </Button>
  );
}

export function ShelterDetailPage({
  locale,
  slug,
}: {
  locale: Locale;
  slug: string;
}) {
  const shelter = getShelterBySlug(slug);
  if (!shelter) notFound();

  const dataset = loadDataset();
  const animals = shelterAnimals(shelter.id);
  const logos = getShelterLogos();
  const hasData = animals.length > 0;
  const text = pageText[locale];
  const messages = getMessages(locale);
  const indexHref = sheltersIndexPath(locale);
  const registerDate = shelterRegisterDate();
  const asOf = registerDate
    ? registerDateLabel(registerDate, locale)
    : undefined;
  // Every one of the seventeen shelters holds a phone, an email or a site
  // today, so the empty case is unreachable from data/shelters.yaml as it
  // stands. The gate is here so a row added without one cannot print a 20px
  // hole under the name: an empty flex box still takes its gap out of the
  // stack above it.
  const hasContacts = Boolean(
    shelter.phone || shelter.email || shelter.website,
  );

  return (
    <SiteShell
      locale={locale}
      languagePaths={{
        sl: `/zavetisca/${shelter.id}`,
        en: `/en/shelters/${shelter.id}`,
      }}
      mainClassName="flex w-full max-w-5xl flex-1 flex-col gap-8 py-page-y sm:gap-10"
      // The longest document on the site. This shelter's grid is uncapped, and
      // the largest of them holds 186 cards: two to a row at the 300 to 330px
      // a row measured in grid-rendering.ts, that is some 28,000px and 186 tab
      // stops between the top of the page and the footer, which is the only
      // way to any other page at phone width. The home grid caps itself at 60
      // with a load-more (grid-rendering.ts) and the register carries this
      // control already (shelters-page.tsx); this page had neither.
      //
      // A client component under a server one, the same as on the register: it
      // reads scroll position and measures the footer, so mounting it here
      // only marks the boundary and everything above stays server rendered.
      // Its label comes from I18nProvider, which the shell already wraps the
      // tree in.
      afterMain={<BackToTop />}
      // docked, on a page that has no dock, for the reason the register's
      // footer carries it (shelters-page.tsx): below lg the button stays
      // pinned to the viewport rather than lifting over the footer, so at the
      // end of the document it lands on the footer links unless the footer
      // reserves the strip it parks in. That padding is derived from
      // --back-to-top-bottom, which is the button's own inset, so the two
      // cannot drift apart.
      //
      // Both are unconditional, and not gated on hasData with the grid: a
      // registry shelter draws no cards but still carries the contacts, the
      // map and its notice, which passes a screen on a phone, and that is the
      // whole of what decides whether the button appears. The pair has to
      // agree page-wide or the strip is missing on exactly the page that
      // needed it.
      footer={<SiteFooter locale={locale} updatedAt={dataset?.generatedAt} docked />}
    >
      {/* This page is where the shelter's own facts live, so the machine
          readable copy of them belongs here rather than on the index. */}
      <JsonLd data={shelterJsonLd(shelter, locale)} />

      <div className="space-y-5">
        {/* The one page on the site that is two levels down, and the only
            one whose trail says something the header nav does not: this
            shelter belongs to the register, and the register belongs to
            the grid. The back link it replaced pointed at the index on a
            cold load and at the root on a warm one, so the control that
            expressed depth was the one that skipped a level. */}
        <PageBreadcrumb
          locale={locale}
          // messages.shelters, not a copy in this file's own pageText:
          // the index page labels the identical crumb from there, and two
          // sources for one word is the drift PageBreadcrumb exists to
          // end.
          trail={[{ label: messages.shelters, href: indexHref }]}
          current={shelter.name}
        />

        {/* The map beside the whole header stack, not beside one part of
            it. The drawing is 320 by 210, so any width that keeps it
            legible makes it taller than a line or two of text, and beside
            anything shorter than the stack the difference came out as a
            dead band. Below sm it follows the contacts, where the single
            column puts it. */}
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-8">
          <div className="min-w-0 flex-1 space-y-5">
            <div className="flex flex-wrap items-center gap-4">
              {/* Only a real mark, the rule the register card follows
                  (shelter-card.tsx): a disc with an initial beside a 30px
                  name was a placeholder, not a mark. Without one the name
                  starts the row. */}
              {logos[shelter.id] && (
                <ShelterAvatar
                  name={shelter.name}
                  logo={logos[shelter.id]}
                  size="lg"
                />
              )}
              {/* A floor under this column rather than min-w-0. The mark
                  beside it draws up to 170px wide (SIZE.lg in
                  shelter-avatar.tsx), which at a 320px viewport left this
                  column about 100px, and neither the name nor the town
                  line fits in that: the page scrolled sideways. With a
                  floor, the row's flex-wrap moves the whole column under
                  the mark instead of crushing it, and the column gets the
                  full width there. Cap the floor at that available width
                  so enlarged text cannot make the floor wider than the page. */}
              <div className="min-w-[min(10rem,100%)] flex-1 space-y-1">
                {/* break-words is the last resort under it: a name whose
                    longest word is wider than the column breaks the word
                    rather than the page. */}
                <h1 className="break-words text-2xl font-semibold tracking-tight sm:text-3xl">
                  {shelter.name}
                </h1>
                {/* Wrapping, not truncation: the town and the count are
                    both facts someone came here for. The two spans keep
                    the pin with the town and the middot with the count, so
                    a break falls between the facts rather than inside
                    one. */}
                <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm text-muted-foreground">
                  <span className="inline-flex min-w-0 items-center gap-1.5">
                    <MapPin className="size-3.5 shrink-0" aria-hidden />
                    <span className="break-words">{shelter.city}</span>
                  </span>
                  {/* The number someone arriving from a card most wants:
                      whether this shelter has more to show. Absent rather
                      than zero for a registry shelter, whose notice below
                      already explains why there is no list. */}
                  {hasData && (
                    <span className="inline-flex items-center gap-1.5">
                      <span className={META_DOT_CLASS}>·</span>
                      {animalCount(animals.length, locale)}
                    </span>
                  )}
                </p>
              </div>
            </div>

            {/* Phone, email, site, in that order on both surfaces that draw
                them: the register card prints them this way because the
                first call someone standing over a found animal makes is a
                call, and a reader who scanned the card and then opened the
                page should not have to find the number in a new place. */}
            {hasContacts && (
              <div className="flex flex-wrap gap-2">
                {shelter.phone && (
                  <ContactButton
                    channel="phone"
                    href={telHref(shelter.phone)}
                    icon={Phone}
                    label={contactName(messages.contactPhone, shelter.phone)}
                  >
                    {shelter.phone}
                  </ContactButton>
                )}
                {shelter.email && (
                  <ContactButton
                    channel="email"
                    href={mailtoHref(shelter.email)}
                    icon={Mail}
                    label={contactName(messages.contactEmail, shelter.email)}
                  >
                    {shelter.email}
                  </ContactButton>
                )}
                {shelter.website && (
                  // The channel is the label here and the host is only
                  // spoken: the button is an action rather than a value to
                  // read back, and the register card already prints the host
                  // for anyone comparing shelters.
                  <ContactButton
                    channel="website"
                    href={shelter.website}
                    icon={Globe}
                    external
                    label={websiteName(
                      messages.contactWebsite,
                      shelter.website,
                      messages.newWindow,
                    )}
                  >
                    {messages.contactWebsite}
                  </ContactButton>
                )}
              </div>
            )}

            {/* Only once there is a point to explain. A shelter that shares
                its list needs no notice: the count beside the town and the
                cards below say what the page holds, and the footer on this
                same page already states that every animal carries its source
                and a link to the original listing. What does need saying is
                an empty page, because a reader cannot tell a shelter with no
                animals from a shelter we publish nothing for. */}
            {!hasData && (
              <div className="flex items-start gap-2.5 rounded-ui border bg-muted/40 px-4 py-3 text-sm leading-relaxed text-muted-foreground">
                <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
                <p>{text.registryNotice}</p>
              </div>
            )}
          </div>
          {/* Smaller than a hero below sm. At the 13rem it draws from sm up
              the country filled a third of a phone screen between the
              contacts and the first card, which is a locator drawn at the
              size of an illustration. */}
          <ShelterLocationMap
            city={shelter.city}
            label={`${text.mapLabel}: ${shelter.city}`}
            className="h-auto w-full max-w-[11rem] shrink-0 sm:max-w-[13rem]"
          />
        </div>
      </div>

      {/* Only where there are animals to show. A registry shelter has no
          list at all, which the notice above already says; a heading over
          an empty grid said the same fact a second time and framed it as a
          list that happens to be empty this week. */}
      {hasData && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2 border-b pb-3">
            {/* One step under the h1 rather than level with it: the page is
                about the shelter, and this is the heading of its list. */}
            <h2 className="text-lg font-medium tracking-tight sm:text-xl">
              {text.animalsTitle}
            </h2>
            {/* The grid here carries this shelter's animals and no filters.
                The home grid reads the shelter off the address, so this
                hands the same animals to the sex, age and size controls
                that only live there. */}
            <a
              href={shelterAnimalsPath(shelter.id, locale)}
              className={MUTED_LINK}
            >
              {text.openInSearch}
            </a>
          </div>
          <ShelterAnimalGrid
            // The same cards and the same dialog as the home page, so the
            // same projection: see animalsForClient in lib/dataset.ts.
            animals={animalsForClient(animals)}
            logos={logos}
            referenceDate={dataset?.generatedAt ?? new Date().toISOString()}
            basePath={`${indexHref}/${shelter.id}`}
          />
        </section>
      )}

      {/* Where this entry came from, on the page that is about this one
          shelter. The index says the same thing for the whole list. */}
      <p className="border-t pt-6 text-xs text-muted-foreground">
        {asOf ? `${text.source}, ${text.asOf} ${asOf}.` : `${text.source}.`}
      </p>
    </SiteShell>
  );
}
