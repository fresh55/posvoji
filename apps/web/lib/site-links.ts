import { FOUND_ANIMAL_PATHS } from "@/lib/found-animal";
import type { Locale, Messages } from "@/lib/i18n";

export type SiteLinkKey = "shelters" | "foundAnimal" | "resources" | "portal";

/** The resources page in both locales, the same contract FOUND_ANIMAL_PATHS
 *  keeps for the lookup. The pair had been written out by hand in three
 *  places, which is two more than can be kept in step: the roster below, the
 *  page's own language switcher, and the sitemap. */
export const RESOURCES_PATHS = {
  sl: "/viri",
  en: "/en/resources",
} as const;

export type SiteLink = {
  key: SiteLinkKey;
  href: string;
  label: string;
  /** De-emphasised where it renders: almost nobody reading these links is
      shelter staff. */
  quiet?: boolean;
  /**
   * Spelled out in the header's inline row, rather than only in the footer
   * and the dropdown. The row is not a copy of the roster: a destination
   * earns a place up there by being a page of its own that the header is the
   * shortest way to. Zavetišča and the found-animal page both are.
   */
  inline?: boolean;
};

/**
 * A roster entry before the hidden ones are dropped. `hidden` is not on
 * SiteLink because siteLinks() never returns one: a link a surface holds is
 * by definition not hidden, and a consumer branching on the flag would be
 * writing dead code.
 *
 * Hidden means listed on no surface: not the footer, not the header's inline
 * row, not the dropdown. The page and its routes stay where they are and keep
 * working, so anything linking to it by hand is unaffected.
 */
type SiteLinkEntry = SiteLink & { hidden?: boolean };

// The one list of destinations the site has beyond the grid and the detail
// pages. The footer and the header menu both draw from it, so a link added or
// renamed here appears in both, and the two surfaces cannot drift apart.
//
// Takes messages rather than calling getMessages itself, because the footer
// resolves them on the server and the menu reads them out of I18nProvider;
// the helper stays indifferent to which side it is on.
export function siteLinks(locale: Locale, messages: Messages): SiteLink[] {
  const links: SiteLinkEntry[] = [
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
    // Hidden on purpose while the page waits for a pass over its contents.
    // /viri and /en/resources still build and still answer; the link is only
    // unlisted. Deleting `hidden` puts it back in the header's dropdown; the
    // footer keeps its own record of which keys it prints, so relisting it
    // there means saying so in site-footer.tsx too.
    {
      key: "resources",
      href: RESOURCES_PATHS[locale],
      label: messages.resources,
      hidden: true,
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
      label: messages.shelterLogin,
      quiet: true,
    },
  ];

  // The one place a hidden link is dropped, so no surface has to know
  // about it.
  return links.filter((link) => !link.hidden);
}
