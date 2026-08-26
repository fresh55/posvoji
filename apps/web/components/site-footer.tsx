import { FOUND_ANIMAL_PATHS } from "@/lib/found-animal";
import { getMessages, type Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type FooterLink = { href: string; label: string; quiet?: boolean };

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
  const resourcesHref = locale === "sl" ? "/viri" : "/en/resources";
  const sheltersHref = locale === "sl" ? "/zavetisca" : "/en/shelters";
  const foundAnimalHref = FOUND_ANIMAL_PATHS[locale];
  // The portal is Slovenian only, so both locales point at the same login
  // page. It stays quiet: almost nobody in this footer is shelter staff.
  const links = [
    showSheltersLink && { href: sheltersHref, label: messages.shelters },
    // muniTab and not muniPromptTitle: the words here are the words on the
    // tab this lands you on, so the link and its destination say the same
    // thing. A question mark would also be the only one in a row of nouns.
    showFoundAnimalLink && {
      href: foundAnimalHref,
      label: messages.muniTab,
    },
    showResourcesLink && { href: resourcesHref, label: messages.resources },
    showPortalLink && {
      href: "/portal/prijava",
      label: messages.forShelters,
      quiet: true,
    },
  ].filter((link): link is FooterLink => Boolean(link));

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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <p className="max-w-3xl">{messages.footer}</p>
        {links.length > 0 && (
          <nav
            aria-label={messages.moreInformation}
            className="flex shrink-0 flex-wrap gap-x-4 gap-y-1"
          >
            {links.map((link) => (
              <a
                key={link.href}
                href={link.href}
                // text-xs leading-relaxed gives these a ~19.5px line box with
                // no padding of their own - short of the 24px a finger needs.
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
      </div>
    </footer>
  );
}
