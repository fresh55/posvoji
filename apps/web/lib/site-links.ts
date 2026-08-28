import { FOUND_ANIMAL_PATHS } from "@/lib/found-animal";
import type { Locale, Messages } from "@/lib/i18n";

export type SiteLinkKey = "shelters" | "foundAnimal" | "resources" | "portal";

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
   * earns a place up there by being somewhere the header is the shortest way
   * to. Zavetišča is; the found-animal lookup already has the hero line and
   * the footer, and the resources page is somewhere you go once.
   */
  inline?: boolean;
};

// The one list of destinations the site has beyond the grid and the detail
// pages. The footer and the header menu both draw from it, so a link added or
// renamed here appears in both, and the two surfaces cannot drift apart.
//
// Takes messages rather than calling getMessages itself, because the footer
// resolves them on the server and the menu reads them out of I18nProvider;
// the helper stays indifferent to which side it is on.
export function siteLinks(locale: Locale, messages: Messages): SiteLink[] {
  return [
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
    },
    {
      key: "resources",
      href: locale === "sl" ? "/viri" : "/en/resources",
      label: messages.resources,
    },
    // The portal is Slovenian only, so both locales point at the same login
    // page. Quiet, but no longer footer-only: a shelter that has been told it
    // can fix its own listings arrives at the top of the site and looks in the
    // corner every other site keeps a login in, and until now the answer was
    // at the bottom of a page that runs the length of the grid.
    {
      key: "portal",
      href: "/portal/prijava",
      label: messages.shelterLogin,
      quiet: true,
    },
  ];
}
