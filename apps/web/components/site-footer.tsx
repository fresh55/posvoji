import { getMessages, type Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type FooterLink = { href: string; label: string; quiet?: boolean };

export function SiteFooter({
  locale,
  showResourcesLink = true,
  showSheltersLink = true,
  showPortalLink = true,
  docked = false,
}: {
  locale: Locale;
  showResourcesLink?: boolean;
  showSheltersLink?: boolean;
  showPortalLink?: boolean;
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
  // The portal is Slovenian only, so both locales point at the same login
  // page. It stays quiet: almost nobody in this footer is shelter staff.
  const links = [
    showSheltersLink && { href: sheltersHref, label: messages.shelters },
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
        docked && "pb-[calc(5.5rem+env(safe-area-inset-bottom))] lg:pb-6",
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
                className={cn(
                  "underline-offset-4 hover:underline",
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
