import { FOUND_ANIMAL_PATHS } from "@/lib/found-animal";
import type { Locale, Messages } from "@/lib/i18n";

export type SiteLinkKey =
  | "shelters"
  | "foundAnimal"
  | "about"
  | "resources"
  | "portal";

/** The resources page in both locales, the same contract FOUND_ANIMAL_PATHS
 *  keeps for the lookup. The pair had been written out by hand in three
 *  places, which is two more than can be kept in step: the roster below, the
 *  page's own language switcher, and the sitemap. */
export const RESOURCES_PATHS = {
  sl: "/viri",
  en: "/en/resources",
} as const;

/** The about page in both locales, kept the same way and for the same
 *  reason. */
export const ABOUT_PATHS = {
  sl: "/o-nas",
  en: "/en/about",
} as const;

/**
 * The content and permissions page, under the about page the way Srečko's is.
 *
 * It is not a roster key and is reached from the one fact it explains, the
 * "Vsebine z dovoljenjem" row on /o-nas. The footer carries two destinations
 * by a decision of its own and this is not a third, and the header's inline
 * row is for pages a reader arrives wanting; nobody opens the site to read a
 * data policy. It is in app/sitemap.ts regardless, the way Srečko's page is:
 * unlisted in the site's own navigation is not the same as hidden from search,
 * and a shelter searching for what we do with its photos should find this.
 */
export const DATA_POLICY_PATHS = {
  sl: "/o-nas/vsebine",
  en: "/en/about/content",
} as const;

export type SiteLink = {
  key: SiteLinkKey;
  href: string;
  hrefLang?: Locale;
  label: string;
  /** De-emphasised where it renders: almost nobody reading these links is
      shelter staff. */
  quiet?: boolean;
  /**
   * Spelled out in the header's inline row, rather than only in the footer
   * and the dropdown. The row is not a copy of the roster: a destination
   * earns a place up there by being a page of its own that the header is the
   * shortest way to. Zavetišča, the found-animal page and O nas all are; the
   * login is a door to another site and Viri is unlisted altogether.
   */
  inline?: boolean;
};

/**
 * Keys listed on no surface: not the footer, not the header's inline row, not
 * the dropdown, and not app/sitemap.ts either. The page and its routes stay
 * where they are and keep working, so anything linking to one by hand is
 * unaffected; it is only never offered.
 *
 * The set rather than a flag on each entry, because the sitemap is built from
 * paths and not from the roster and still has to answer the same question. A
 * key taken out of here is listed again everywhere at once, which is the only
 * way the menus and the sitemap cannot end up saying different things about
 * the same page.
 *
 * Currently: /viri and /en/resources, while the page waits for a pass over its
 * contents. The two routes also carry robots: noindex for as long as they are
 * in here, so a page the site does not link to is not offered in search
 * either.
 */
export const HIDDEN_LINK_KEYS: ReadonlySet<SiteLinkKey> = new Set(["resources"]);

// The one list of destinations the site has beyond the grid and the detail
// pages. The footer and the header menu both draw from it, so a link added or
// renamed here appears in both, and the two surfaces cannot drift apart.
//
// Takes messages rather than calling getMessages itself, because the footer
// resolves them on the server and the menu reads them out of I18nProvider;
// the helper stays indifferent to which side it is on.
export function siteLinks(locale: Locale, messages: Messages): SiteLink[] {
  const links: SiteLink[] = [
    {
      key: "shelters",
      href: locale === "sl" ? "/zavetisca" : "/en/shelters",
      label: messages.shelters,
      inline: true,
    },
    // muniTab and not muniPromptTitle: the words here are the words on the
    // tab this lands you on, so the link and its destination say the same
    // thing. A question mark would also be the only one in a row of nouns.
    {
      key: "foundAnimal",
      href: FOUND_ANIMAL_PATHS[locale],
      label: messages.muniTab,
      inline: true,
    },
    // What the site is and what it is not, in one screen. In the row from
    // the top of every page, because the reader who wants it is the one
    // asking who put a list of animals on the internet and what they want
    // for it, and that reader asks before scrolling, not after. The footer
    // is the length of the grid away, and a site that answers "who are you"
    // only at the bottom answers it late.
    {
      key: "about",
      href: ABOUT_PATHS[locale],
      label: messages.about,
      inline: true,
    },
    // Unlisted while the page waits for a pass over its contents: see
    // HIDDEN_LINK_KEYS above. /viri and /en/resources still build and still
    // answer; the link is only never offered. Taking the key out of that set
    // puts it back in the header's dropdown and in the sitemap; the footer
    // keeps its own record of which keys it prints, so relisting it there
    // means saying so in site-footer.tsx too.
    {
      key: "resources",
      href: RESOURCES_PATHS[locale],
      label: messages.resources,
    },
    // The portal is Slovenian only, so both locales point at the same login
    // page. Quiet, and no longer in the footer: a shelter that has been told
    // it can fix its own listings arrives at the top of the site and looks in
    // the corner every other site keeps a login in. That is where it is now,
    // as a button from lg and in the dropdown below it, and printing it a
    // third time at the bottom of a page that runs the length of the grid
    // added nothing.
    {
      key: "portal",
      href: "/portal/prijava",
      hrefLang: "sl",
      label: messages.shelterLogin,
      quiet: true,
    },
  ];

  // The one place a hidden link is dropped, so no surface has to know
  // about it.
  return links.filter((link) => !HIDDEN_LINK_KEYS.has(link.key));
}
