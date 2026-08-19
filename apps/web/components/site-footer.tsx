import { getMessages, type Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type FooterLink = { href: string; label: string; quiet?: boolean };

export function SiteFooter({
  locale,
  showResourcesLink = true,
  showSheltersLink = true,
  showPortalLink = true,
}: {
  locale: Locale;
  showResourcesLink?: boolean;
  showSheltersLink?: boolean;
  showPortalLink?: boolean;
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
    <footer className="bleed border-t py-6 text-xs leading-relaxed text-muted-foreground">
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
