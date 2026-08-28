import { getMessages, type Locale } from "@/lib/i18n";
import { siteLinks, type SiteLinkKey } from "@/lib/site-links";
import { cn } from "@/lib/utils";

export function SiteFooter({
  locale,
  showResourcesLink = true,
  showSheltersLink = true,
  showPortalLink = true,
  showFoundAnimalLink = true,
  docked = false,
}: {
  locale: Locale;
  showResourcesLink?: boolean;
  showSheltersLink?: boolean;
  showPortalLink?: boolean;
  /**
   * The way into the found-animal lookup, on every page rather than only the
   * homepage. It did not exist anywhere else: the dialog is mounted by
   * AnimalGrid, so on /zavetisca/[slug] and /viri and every animal page the
   * flow was unreachable in any form. That matters because "zavetišče
   * Ljubljana" is a likelier search for someone holding a stray than anything
   * that lands on the homepage.
   *
   * Defaulted on. The coverage table is static repo data, so the page this
   * links to exists in every real build; an empty table leaves the finder
   * with no matches to offer rather than the link broken. The found-animal
   * page itself switches it off, being the destination.
   */
  showFoundAnimalLink?: boolean;
  /**
   * Set on a page that floats the filter dock over its bottom edge. The grid
   * carried this clearance, but the grid is not what ends the document: the
   * footer is, and it is a sibling of `main`. So the dock cleared the last
   * row of cards and then sat on top of these links, which are the only way
   * to any other page at phone width. Measured on a 390px phone: all three
   * were covered, and every one of them failed a hit test.
   */
  docked?: boolean;
}) {
  const messages = getMessages(locale);
  // The roster lives in lib/site-links.ts, shared with the header menu. What
  // is decided here is only which of them this page shows: a page passes its
  // own link off rather than linking to itself.
  const shown: Record<SiteLinkKey, boolean> = {
    shelters: showSheltersLink,
    foundAnimal: showFoundAnimalLink,
    resources: showResourcesLink,
    portal: showPortalLink,
  };
  const links = siteLinks(locale, messages).filter((link) => shown[link.key]);

  return (
    <footer
      className={cn(
        "bleed border-t py-6 text-xs leading-relaxed text-muted-foreground",
        // Only below lg, which is where the dock is; above it the dock is
        // gone and the extra air would just be a hole under the page.
        // Measured off back-to-top's own inset rather than restated: that
        // button docks at --back-to-top-bottom and is size-11 (2.75rem), so
        // its band reaches 2.75rem higher, and the remaining 0.25rem is the
        // gap above it. Cleared to the dock alone, this padding left the
        // button sitting over these links at the bottom of the document.
        docked && "pb-[calc(var(--back-to-top-bottom)+3rem)] lg:pb-6",
      )}
    >
      {/* Links first in the DOM, prose second. On a phone the column shows
          them in that order, because the links are the footer's working part
          - the only way to any other page - and the provenance note is the
          small print that follows. From sm the row reverses so the reading
          order of the wide layout stays prose left, links right, the shape
          every colophon has taught. */}
      <div className="flex flex-col gap-3 sm:flex-row-reverse sm:items-start sm:justify-between">
        {links.length > 0 && (
          <nav
            aria-label={messages.moreInformation}
            // A step larger below lg: these are destinations under a thumb,
            // not fine print, and text-xs let them read as the latter.
            className="flex shrink-0 flex-wrap gap-x-4 gap-y-2 max-lg:text-sm"
          >
            {links.map((link) => (
              <a
                key={link.href}
                href={link.href}
                // The line boxes here run short of the 24px a finger needs.
                // Same treatment the rest of the small-link grammar uses
                // rather than padding, which would visibly inflate the row.
                className={cn(
                  "underline-offset-4 hover:underline max-lg:tap-target",
                  link.quiet
                    ? "text-muted-foreground hover:text-foreground"
                    : "font-medium text-foreground",
                )}
              >
                {link.label}
              </a>
            ))}
          </nav>
        )}
        <p className="max-w-3xl">{messages.footer}</p>
      </div>
    </footer>
  );
}
